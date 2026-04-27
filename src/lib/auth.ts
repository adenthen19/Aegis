import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from './types';

export type CurrentUser = {
  id: string;
  email: string;
  role: UserRole;
};

const VALID_ROLES: UserRole[] = ['member', 'director', 'super_admin'];

export async function getCurrentUserWithRole(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .maybeSingle();

  const raw = profile?.role as string | undefined;
  const role: UserRole = VALID_ROLES.includes(raw as UserRole)
    ? (raw as UserRole)
    : 'member';

  return { id: user.id, email: user.email ?? '', role };
}

// Page guard — super-admin only (user mgmt, deliverable templates).
export async function requireSuperAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (user.role !== 'super_admin') redirect('/dashboard');
  return user;
}

// Page guard — director or super-admin (firm-wide dashboard).
export async function requireDirectorOrAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUserWithRole();
  if (!user) redirect('/login');
  if (user.role !== 'director' && user.role !== 'super_admin') {
    redirect('/dashboard');
  }
  return user;
}

// Action guard — super-admin only.
export async function assertSuperAdmin(): Promise<{ ok: true; user: CurrentUser } | { ok: false; error: string }> {
  const user = await getCurrentUserWithRole();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (user.role !== 'super_admin') {
    return { ok: false, error: 'Only super admins can manage users.' };
  }
  return { ok: true, user };
}
