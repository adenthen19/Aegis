import { createClient } from '@supabase/supabase-js';

// Service-role client — bypasses RLS and unlocks the auth admin API
// (createUser / updateUserById / deleteUser). Server-only. Never import this
// from a Client Component or expose the SUPABASE_SERVICE_ROLE_KEY env var.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. Add it to .env.local — find the value in Supabase Dashboard → Project Settings → API → service_role.',
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
