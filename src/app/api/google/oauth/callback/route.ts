import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  exchangeCodeForTokens,
  fetchGoogleEmail,
} from '@/lib/google/oauth';

export const runtime = 'nodejs';

// GET /api/google/oauth/callback — Google redirects here after consent.
//
// Validates the CSRF state cookie, exchanges the auth code for tokens, looks
// up the connected Google email, and upserts a row into google_connections.
// Then bounces the user back to /profile?google=connected so the UI can
// flash a confirmation.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');

  const homeUrl = new URL('/integrations', url.origin);

  if (errorParam) {
    homeUrl.searchParams.set('google', 'error');
    homeUrl.searchParams.set('reason', errorParam);
    return NextResponse.redirect(homeUrl);
  }
  if (!code || !state) {
    homeUrl.searchParams.set('google', 'error');
    homeUrl.searchParams.set('reason', 'missing_params');
    return NextResponse.redirect(homeUrl);
  }

  const jar = await cookies();
  const expected = jar.get('google_oauth_state')?.value;
  jar.delete('google_oauth_state');
  if (!expected || expected !== state) {
    homeUrl.searchParams.set('google', 'error');
    homeUrl.searchParams.set('reason', 'state_mismatch');
    return NextResponse.redirect(homeUrl);
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    homeUrl.pathname = '/login';
    return NextResponse.redirect(homeUrl);
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    if (!tokens.refresh_token) {
      // Without a refresh_token we can't keep the connection alive. This
      // happens if the user previously granted without revoking — Google
      // only ships a refresh_token on the first consent for a given app.
      // The `prompt=consent` we pass in buildAuthUrl normally prevents
      // this, but surface it explicitly if it does happen.
      homeUrl.searchParams.set('google', 'error');
      homeUrl.searchParams.set('reason', 'no_refresh_token');
      return NextResponse.redirect(homeUrl);
    }

    const email = await fetchGoogleEmail(tokens.access_token);
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    const { error: upsertErr } = await supabase
      .from('google_connections')
      .upsert(
        {
          user_id: user.id,
          google_email: email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expires_at: expiresAt.toISOString(),
          scope: tokens.scope,
        },
        { onConflict: 'user_id' },
      );
    if (upsertErr) {
      homeUrl.searchParams.set('google', 'error');
      homeUrl.searchParams.set('reason', 'storage_failed');
      return NextResponse.redirect(homeUrl);
    }

    homeUrl.searchParams.set('google', 'connected');
    return NextResponse.redirect(homeUrl);
  } catch (err) {
    homeUrl.searchParams.set('google', 'error');
    homeUrl.searchParams.set(
      'reason',
      err instanceof Error ? err.message.slice(0, 120) : 'unknown',
    );
    return NextResponse.redirect(homeUrl);
  }
}
