import { randomBytes } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { buildAuthUrl } from '@/lib/google/oauth';

export const runtime = 'nodejs';

// GET /api/google/oauth/start — kicks off the OAuth flow.
//
// We sign the user in (must be authenticated to connect a Google account),
// stash a CSRF state in a short-lived httpOnly cookie, and 302 to Google.
// The callback compares the state cookie against the `state` query param
// Google bounces back, so an attacker can't initiate the connect flow on
// the user's behalf.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const state = randomBytes(24).toString('hex');
  const jar = await cookies();
  jar.set('google_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes — plenty for the round-trip
  });

  redirect(buildAuthUrl(state));
}
