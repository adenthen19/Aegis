import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { revokeToken } from '@/lib/google/oauth';

export const runtime = 'nodejs';

// POST /api/google/oauth/disconnect — drops the user's Google connection.
//
// Hits Google's revoke endpoint as a courtesy (so the access grant disappears
// from the user's Google "third-party access" list immediately) and then
// deletes the local row regardless of revoke success.
export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: conn } = await supabase
    .from('google_connections')
    .select('refresh_token')
    .eq('user_id', user.id)
    .maybeSingle();

  if (conn?.refresh_token) {
    await revokeToken(conn.refresh_token as string);
  }

  await supabase.from('google_connections').delete().eq('user_id', user.id);

  // For a fetch-driven button flow we just return ok; the client refreshes
  // the page itself. For a form POST we redirect back to /profile.
  const url = new URL(req.url);
  if (url.searchParams.get('redirect') === '1') {
    return NextResponse.redirect(
      new URL('/integrations?google=disconnected', url.origin),
    );
  }
  return NextResponse.json({ ok: true });
}
