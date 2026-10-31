
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface GmailHeader {
  name?: string;
  value?: string;
}

interface GmailMessageId {
  id: string;
  threadId: string;
}

interface GmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string;
  subject: string;
  date: string;
  messageDate: string | null;
  snippet: string;
  unread: boolean;
}

function jsonResponse(
  body: Record<string, unknown>,
  status = 200,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  });
}

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);

  return Uint8Array.from(
    binary,
    (char) => char.charCodeAt(0),
  );
}

async function decryptRefreshToken(
  encryptedToken: string,
  encryptionKey: string,
): Promise<string> {
  const keyBytes = base64ToBytes(encryptionKey);

  if (keyBytes.length !== 32) {
    throw new Error('Invalid Gmail token encryption key.');
  }

  const encryptedBytes = base64ToBytes(encryptedToken);

  if (encryptedBytes.length <= 28) {
    throw new Error('Stored Gmail token is invalid.');
  }

  const iv = encryptedBytes.slice(0, 12);
  const ciphertext = encryptedBytes.slice(12);

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['decrypt'],
  );

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext,
  );

  return new TextDecoder().decode(decrypted);
}

async function getGoogleAccessToken(
  refreshToken: string,
): Promise<string> {
  const clientId = getRequiredEnv('GOOGLE_CLIENT_ID');
  const clientSecret = getRequiredEnv('GOOGLE_CLIENT_SECRET');

  const response = await fetch(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
      }),
    },
  );

  const result = await response.json();

  if (!response.ok || !result.access_token) {
    console.error('Google token refresh failed:', result);
    throw new Error('Could not refresh Gmail access token.');
  }

  return result.access_token;
}

function getHeader(
  headers: GmailHeader[],
  headerName: string,
): string {
  return (
    headers.find(
      (header) =>
        header.name?.toLowerCase() === headerName.toLowerCase(),
    )?.value ?? ''
  );
}

function parseMessageDate(date: string): string | null {
  if (!date) return null;

  const timestamp = Date.parse(date);

  if (Number.isNaN(timestamp)) {
    return null;
  }

  return new Date(timestamp).toISOString();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = getRequiredEnv('SUPABASE_URL');

    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

    if (!anonKey) {
      throw new Error('Missing Supabase anon or publishable key.');
    }

    const serviceRoleKey = getRequiredEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    const encryptionKey = getRequiredEnv(
      'GMAIL_TOKEN_ENCRYPTION_KEY',
    );

    // Authenticate the Smart Mail user.
    const authorization = req.headers.get('Authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse(
        { error: 'Authentication required.' },
        401,
      );
    }

    const accessToken = authorization.substring(7);

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    const {
      data: { user },
      error: userError,
    } = await authClient.auth.getUser(accessToken);

    if (userError || !user) {
      return jsonResponse({ error: 'Invalid session.' }, 401);
    }

    // Create backend admin client.
    const adminClient = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // Find this user's connected Gmail account.
    const { data: account, error: accountError } =
      await adminClient
        .from('mail_accounts')
        .select('id, gmail_address')
        .eq('user_id', user.id)
        .eq('sync_status', 'connected')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (accountError) {
      console.error('Account lookup failed:', accountError);

      return jsonResponse(
        { error: 'Could not find Gmail account.' },
        500,
      );
    }

    if (!account) {
      return jsonResponse(
        { error: 'No connected Gmail account found.' },
        404,
      );
    }

    // Retrieve encrypted refresh token.
    const { data: tokenRecord, error: tokenError } =
      await adminClient
        .from('gmail_oauth_tokens')
        .select('refresh_token_ciphertext')
        .eq('mail_account_id', account.id)
        .eq('user_id', user.id)
        .maybeSingle();

    if (tokenError || !tokenRecord) {
      console.error('Token lookup failed:', tokenError);

      return jsonResponse(
        { error: 'Gmail authorization token not found.' },
        404,
      );
    }

    // Decrypt token only inside the backend.
    const refreshToken = await decryptRefreshToken(
      tokenRecord.refresh_token_ciphertext,
      encryptionKey,
    );

    // Obtain a fresh Google access token.
    const googleAccessToken =
      await getGoogleAccessToken(refreshToken);

    // Fetch latest 20 Gmail message IDs.
    const listResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20',
      {
        headers: {
          Authorization: `Bearer ${googleAccessToken}`,
        },
      },
    );

    const listResult = await listResponse.json();

    if (!listResponse.ok) {
      console.error('Gmail message list failed:', listResult);

      throw new Error('Unable to retrieve Gmail messages.');
    }

    const messageIds = (
      listResult.messages ?? []
    ) as GmailMessageId[];

    // Fetch individual message metadata.
    const messages: GmailMessage[] = await Promise.all(
      messageIds.map(async (message) => {
        const response = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
          {
            headers: {
              Authorization: `Bearer ${googleAccessToken}`,
            },
          },
        );

        const result = await response.json();

        if (!response.ok) {
          console.error('Gmail message detail failed:', result);

          throw new Error(
            'Unable to retrieve an email message.',
          );
        }

        const headers: GmailHeader[] =
          result.payload?.headers ?? [];

        const date = getHeader(headers, 'Date');

        return {
          id: result.id,
          threadId: result.threadId,
          from: getHeader(headers, 'From'),
          to: getHeader(headers, 'To'),
          subject: getHeader(headers, 'Subject'),
          date,
          messageDate: parseMessageDate(date),
          snippet: result.snippet ?? '',
          unread: (result.labelIds ?? []).includes('UNREAD'),
        };
      }),
    );

    // Prepare messages for Supabase storage.
    const records = messages.map((message) => ({
      mail_account_id: account.id,
      user_id: user.id,
      gmail_message_id: message.id,
      gmail_thread_id: message.threadId,
      sender: message.from,
      recipient: message.to,
      subject: message.subject,
      message_date: message.messageDate,
      snippet: message.snippet,
      is_unread: message.unread,
      updated_at: new Date().toISOString(),
    }));

    // Insert new messages and update existing ones.
    if (records.length > 0) {
      const { error: saveError } = await adminClient
        .from('mail_messages')
        .upsert(records, {
          onConflict: 'mail_account_id,gmail_message_id',
        });

      if (saveError) {
        console.error('Email storage failed:', saveError);

        throw new Error(
          'Emails were fetched but could not be saved to Supabase.',
        );
      }
    }

    // Update last synchronization time.
    const { error: updateError } = await adminClient
      .from('mail_accounts')
      .update({
        last_synced_at: new Date().toISOString(),
        sync_status: 'connected',
      })
      .eq('id', account.id)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Account sync update failed:', updateError);
    }

    return jsonResponse({
      success: true,
      account: account.gmail_address,
      total: messages.length,
      saved: records.length,
      messages,
    });
  } catch (error) {
    console.error('gmail-sync error:', error);

    return jsonResponse(
      {
        error:
          error instanceof Error
            ? error.message
            : 'An unexpected error occurred.',
      },
      500,
    );
  }
});
