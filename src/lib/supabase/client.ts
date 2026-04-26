import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // During Next.js prerendering/build, these might be undefined.
  // We provide placeholders to avoid @supabase/ssr throwing an error.
  if (!url || !anonKey) {
    return createBrowserClient(
      url ?? 'https://placeholder.supabase.co',
      anonKey ?? 'placeholder-key'
    );
  }

  return createBrowserClient(url, anonKey);
}
