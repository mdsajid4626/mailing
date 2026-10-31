
import { createClient } from 'npm:@supabase/supabase-js@2';

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function redirectToApp(
  platform: 'web' | 'android',
  status: 'connected' | 'error',
  message?: string,
) {
  const destination =
    platform === 'web'
      ? new URL('http://localhost:8081/dashboard')
      : new URL('smartmail://dashboard');

  destination.searchParams.set('gmail', status);

  if (message) {
    destination.searchParams.set('message', message);
  }

  return Response.redirect(destination.toString(), 302);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

// Encrypt refresh token using AES-256-GCM.
// Stored format: Base64(12-byte IV + encrypted token + authentication tag).
async function encryptRefreshToken(
  refreshToken: string,
  base64Key: string,
): Promise<string> {
  const keyBytes = base64ToBytes(base64Key);

  if (keyBytes.length !== 32) {
    throw new Error(
      'GMAIL_TOKEN_ENCRYPTION_KEY must decode to exactly 32 bytes.',
    );
  }

  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'AES-GCM' },
    false,
    ['encrypt'],
  );

  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(refreshToken),
  );

  const combined = new Uint8Array(
    iv.length + encrypted.byteLength,
  );

  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);

  return bytesToBase64(combined);
}

function errorMessage(error: unknown): string {
  console.error('gmail-oauth-callback error:', error);
  return 'Gmail connection failed. Please try again.';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') {
    return new Response('Method not allowed', { status: 405 });
  }

  let platform: 'web' | 'android' = 'web';

  try {
    const requestUrl = new URL(req.url);

    const code = requestUrl.searchParams.get('code');
    const state = requestUrl.searchParams.get('state');
    const googleError = requestUrl.searchParams.get('error');

    if (!state) {
      return new Response('Missing OAuth state.', { status: 400 });
    }

    const supabaseUrl = getRequiredEnv('SUPABASE_URL');
    const serviceRoleKey = getRequiredEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    const googleClientId = getRequiredEnv('GOOGLE_CLIENT_ID');
    const googleClientSecret = getRequiredEnv(
      'GOOGLE_CLIENT_SECRET',
    );
    const googleRedirectUri = getRequiredEnv('GOOGLE_REDIRECT_URI');
    const encryptionKey = getRequiredEnv(
      'GMAIL_TOKEN_ENCRYPTION_KEY',
    );

    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    // Hash the state received from Google.
    const stateBytes = new TextEncoder().encode(state);
    const stateDigest = await crypto.subtle.digest(
      'SHA-256',
      stateBytes,
    );

    const stateHash = Array.from(new Uint8Array(stateDigest))
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');

    // Atomically consume the state.
    // An expired or previously used state cannot be accepted.
    const { data: stateRecord, error: stateError } = await admin
      .from('gmail_oauth_states')
      .delete()
      .eq('state_hash', stateHash)
      .gt('expires_at', new Date().toISOString())
      .select('user_id, platform')
      .maybeSingle();

    if (stateError) {
      console.error('OAuth state validation failed:', stateError);
      return new Response('Could not validate OAuth state.', {
        status: 400,
      });
    }

    if (!stateRecord) {
      return new Response(
        'Invalid, expired, or already used OAuth state.',
        { status: 400 },
      );
    }

    if (
      stateRecord.platform !== 'web' &&
      stateRecord.platform !== 'android'
    ) {
      return new Response('Invalid platform.', { status: 400 });
    }

    platform = stateRecord.platform;

    if (googleError || !code) {
      return redirectToApp(
        platform,
        'error',
        'Google authorization was not completed.',
      );
    }

    // Exchange Google's authorization code for tokens.
    const tokenResponse = await fetch(
      'https://oauth2.googleapis.com/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: googleClientId,
          client_secret: googleClientSecret,
          redirect_uri: googleRedirectUri,
          grant_type: 'authorization_code',
        }),
      },
    );

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error('Google token exchange failed:', tokenData);
      throw new Error('Google token exchange failed.');
    }

    // Verify the Google account identity.
    const userInfoResponse = await fetch(
      'https://openidconnect.googleapis.com/v1/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
    );

    const userInfo = await userInfoResponse.json();

    if (
      !userInfoResponse.ok ||
      !userInfo.email ||
      userInfo.email_verified !== true
    ) {
      throw new Error('Could not verify Google account email.');
    }

    const gmailAddress = String(userInfo.email).toLowerCase();

    // Find an existing account belonging to this Smart Mail user.
    const { data: existingAccount, error: accountLookupError } =
      await admin
        .from('mail_accounts')
        .select('id')
        .eq('user_id', stateRecord.user_id)
        .eq('gmail_address', gmailAddress)
        .maybeSingle();

    if (accountLookupError) {
      throw accountLookupError;
    }

    let existingToken = null;

    if (existingAccount) {
      const { data, error } = await admin
        .from('gmail_oauth_tokens')
        .select('id')
        .eq('mail_account_id', existingAccount.id)
        .maybeSingle();

      if (error) throw error;

      existingToken = data;
    }

    // Google may omit refresh_token on reconnection.
    // Preserve the previously stored encrypted token in that case.
    if (!tokenData.refresh_token && !existingToken) {
      throw new Error(
        'Google did not return a refresh token. Please reconnect with consent.',
      );
    }

    // Create or update the Gmail account.
    const { data: mailAccount, error: upsertAccountError } =
      await admin
        .from('mail_accounts')
        .upsert(
          {
            user_id: stateRecord.user_id,
            gmail_address: gmailAddress,
            sync_status: 'connected',
          },
          {
            onConflict: 'user_id,gmail_address',
          },
        )
        .select('id')
        .single();

    if (upsertAccountError || !mailAccount) {
      throw upsertAccountError ??
        new Error('Could not save Gmail account.');
    }

    const grantedScopes =
      typeof tokenData.scope === 'string'
        ? tokenData.scope.split(' ').filter(Boolean)
        : [
            'openid',
            'email',
            'https://www.googleapis.com/auth/gmail.readonly',
          ];

    if (tokenData.refresh_token) {
      const encryptedRefreshToken = await encryptRefreshToken(
        tokenData.refresh_token,
        encryptionKey,
      );

      const { error: tokenSaveError } = await admin
        .from('gmail_oauth_tokens')
        .upsert(
          {
            mail_account_id: mailAccount.id,
            user_id: stateRecord.user_id,
            refresh_token_ciphertext: encryptedRefreshToken,
            granted_scopes: grantedScopes,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: 'mail_account_id',
          },
        );

      if (tokenSaveError) throw tokenSaveError;
    } else {
      // Keep the previous encrypted refresh token.
      const { error: tokenUpdateError } = await admin
        .from('gmail_oauth_tokens')
        .update({
          granted_scopes: grantedScopes,
          updated_at: new Date().toISOString(),
        })
        .eq('mail_account_id', mailAccount.id);

      if (tokenUpdateError) throw tokenUpdateError;
    }

    return redirectToApp(platform, 'connected');
  } catch (error) {
    errorMessage(error);

    return redirectToApp(
      platform,
      'error',
      'Unable to connect Gmail. Please try again.',
    );
  }
});
