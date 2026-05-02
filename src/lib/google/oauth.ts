// Aegis ↔ Google OAuth — minimal helper, no `googleapis` SDK pulled in.
//
// We hand-roll the four endpoints we actually use (auth URL, code exchange,
// refresh, revoke) against `oauth2.googleapis.com`. Saves us ~10 MB of SDK
// surface and the same call pattern works across edge / node runtimes.

import { createClient } from '@/lib/supabase/server';
import type { GoogleConnection } from '@/lib/types';

const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const USERINFO_SCOPE = 'https://www.googleapis.com/auth/userinfo.email';

// Treat tokens as expired ~60 s before their stated expiry so we don't burn
// a request on a token that's about to flip stale mid-flight.
const REFRESH_LEEWAY_MS = 60_000;

function readEnv() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      'Google OAuth env vars missing — set GOOGLE_OAUTH_CLIENT_ID, '
        + 'GOOGLE_OAUTH_CLIENT_SECRET and GOOGLE_OAUTH_REDIRECT_URI.',
    );
  }
  return { clientId, clientSecret, redirectUri };
}

// ─────────────────────────────────────────────────────────────────────────
// Auth URL
// ─────────────────────────────────────────────────────────────────────────

export function buildAuthUrl(state: string): string {
  const { clientId, redirectUri } = readEnv();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: `${SHEETS_SCOPE} ${USERINFO_SCOPE}`,
    // offline + consent forces Google to issue a refresh_token even on
    // re-grants; without these you can re-grant and end up with no refresh
    // token because Google assumes you already have one.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Token exchange
// ─────────────────────────────────────────────────────────────────────────

type TokenResponse = {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: 'Bearer';
};

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const { clientId, clientSecret, redirectUri } = readEnv();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token exchange failed (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; expires_in: number; scope: string }> {
  const { clientId, clientSecret } = readEnv();
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
  };
}

export async function revokeToken(token: string): Promise<void> {
  // Best-effort — Google's revoke endpoint is idempotent and returns 200 even
  // for already-revoked tokens. We don't fail the disconnect flow if this
  // errors; the row is still removed locally.
  try {
    await fetch(
      `https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`,
      { method: 'POST' },
    );
  } catch {
    /* swallow — local disconnect is the source of truth */
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Userinfo (we read the connected Gmail address so the UI can show
// "Connected as sarah@gmail.com" rather than just "Connected").
// ─────────────────────────────────────────────────────────────────────────

export async function fetchGoogleEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status}).`);
  }
  const json = (await res.json()) as { email?: string };
  if (!json.email) throw new Error('Google did not return an email.');
  return json.email;
}

// ─────────────────────────────────────────────────────────────────────────
// Persistence — load / store / refresh in one helper
// ─────────────────────────────────────────────────────────────────────────

export async function getConnectionForCurrentUser(): Promise<GoogleConnection | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('google_connections')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();
  return (data as GoogleConnection | null) ?? null;
}

// Returns a fresh access token, refreshing if necessary. Updates the stored
// row so subsequent calls in this request (and concurrent kiosks) hit the
// new value. Throws if the user isn't connected.
export async function getValidAccessToken(): Promise<{
  accessToken: string;
  email: string;
}> {
  const conn = await getConnectionForCurrentUser();
  if (!conn) {
    throw new Error('Google account not connected.');
  }

  const expiresAt = new Date(conn.expires_at).getTime();
  if (Date.now() < expiresAt - REFRESH_LEEWAY_MS) {
    return { accessToken: conn.access_token, email: conn.google_email };
  }

  const refreshed = await refreshAccessToken(conn.refresh_token);
  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000);

  const supabase = await createClient();
  await supabase
    .from('google_connections')
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpiresAt.toISOString(),
      scope: refreshed.scope,
    })
    .eq('user_id', conn.user_id);

  return { accessToken: refreshed.access_token, email: conn.google_email };
}
