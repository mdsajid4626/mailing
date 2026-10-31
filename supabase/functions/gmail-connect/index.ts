
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

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

// Generate a cryptographically secure random OAuth state.
function generateState(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);

  const binary = Array.from(bytes)
    .map((byte) => String.fromCharCode(byte))
    .join('');

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

// Store only the SHA-256 hash of the state.
async function hashState(state: string): Promise<string> {
  const data = new TextEncoder().encode(state);
  const hash = await crypto.subtle.digest('SHA-256', data);

  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    // Read and validate the requested platform.
    const requestBody = await req.json().catch(() => ({}));

    const platform = requestBody?.platform;

    if (platform !== 'web' && platform !== 'android') {
      return jsonResponse(
        { error: 'Invalid platform. Use web or android.' },
        400,
      );
    }

    const supabaseUrl = getRequiredEnv('SUPABASE_URL');

    const anonKey =
      Deno.env.get('SUPABASE_ANON_KEY') ??
      Deno.env.get('SUPABASE_PUBLISHABLE_KEY');

    if (!anonKey) {
      throw new Error('Missing Supabase anon or publishable key');
    }

    const serviceRoleKey = getRequiredEnv(
      'SUPABASE_SERVICE_ROLE_KEY',
    );

    const googleClientId = getRequiredEnv('GOOGLE_CLIENT_ID');
    const googleRedirectUri = getRequiredEnv('GOOGLE_REDIRECT_URI');

    // Require the user's Supabase access token.
    const authorization = req.headers.get('Authorization');

    if (!authorization?.startsWith('Bearer ')) {
      return jsonResponse(
        { error: 'Missing authentication token' },
        401,
      );
    }

    const accessToken = authorization.substring(7);

    // Verify the token and identify the signed-in user.
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
      return jsonResponse(
        { error: 'Invalid or expired Supabase session' },
        401,
      );
    }

    // Backend-only client for writing the OAuth state record.
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

    const state = generateState();
    const stateHash = await hashState(state);

    // OAuth state expires after 10 minutes.
    const expiresAt = new Date(
      Date.now() + 10 * 60 * 1000,
    ).toISOString();

    const { error: insertError } = await adminClient
      .from('gmail_oauth_states')
      .insert({
        state_hash: stateHash,
        user_id: user.id,
        platform: platform,
        expires_at: expiresAt,
      });

    if (insertError) {
      console.error('OAuth state insert failed:', insertError);

      return jsonResponse(
        { error: 'Could not start Gmail connection' },
        500,
      );
    }

    // Request read-only Gmail access and email identity.
    const scopes = [
      'openid',
      'email',
      'https://www.googleapis.com/auth/gmail.readonly',
    ];

    const googleUrl = new URL(
      'https://accounts.google.com/o/oauth2/v2/auth',
    );

    googleUrl.search = new URLSearchParams({
      client_id: googleClientId,
      redirect_uri: googleRedirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();

    return jsonResponse({
      authorizationUrl: googleUrl.toString(),
      expiresAt,
    });
  } catch (error) {
    console.error('gmail-connect error:', error);

    return jsonResponse(
      { error: 'Internal server error' },
      500,
    );
  }
});
