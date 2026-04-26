import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    console.error('Missing Supabase environment variables in Proxy');
  }

  const supabase = createServerClient(
    url ?? 'https://placeholder.supabase.co',
    anonKey ?? 'placeholder-key',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  try {
    const { data: { user } } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;
    const isAuthRoute = pathname.startsWith('/login') || pathname.startsWith('/auth');

    if (!user && !isAuthRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  } catch (err) {
    console.error('Supabase auth error in Proxy:', err);
  }

  return supabaseResponse;
}
