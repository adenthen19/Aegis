'use server';

import { revalidatePath } from 'next/cache';
import { assertSuperAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const ROLES: UserRole[] = ['member', 'super_admin'];
const USERNAME_RE = /^[a-zA-Z0-9_.-]+$/;

type UserPayload = {
  display_name: string;
  username: string;
  email: string;
  gmail_address: string | null;
  contact_number: string | null;
  avatar_url: string | null;
  role: UserRole;
};

function readPayload(formData: FormData): { ok: true; value: UserPayload } | { ok: false; error: string } {
  const display_name = formData.get('display_name')?.toString().trim() ?? '';
  const username = formData.get('username')?.toString().trim() ?? '';
  const email = formData.get('email')?.toString().trim().toLowerCase() ?? '';
  const gmail_address = formData.get('gmail_address')?.toString().trim().toLowerCase() || null;
  const contact_number = formData.get('contact_number')?.toString().trim() || null;
  const avatar_url = formData.get('avatar_url')?.toString().trim() || null;
  const role_raw = formData.get('role')?.toString() ?? 'member';

  if (!display_name) return { ok: false, error: 'Name is required.' };
  if (!username) return { ok: false, error: 'Username is required.' };
  if (!USERNAME_RE.test(username)) {
    return { ok: false, error: 'Username can only contain letters, numbers, dot, dash, underscore.' };
  }
  if (!email) return { ok: false, error: 'Company email is required.' };
  if (!ROLES.includes(role_raw as UserRole)) return { ok: false, error: 'Invalid role.' };

  return {
    ok: true,
    value: {
      display_name,
      username,
      email,
      gmail_address,
      contact_number,
      avatar_url,
      role: role_raw as UserRole,
    },
  };
}

async function isUsernameTaken(
  supabase: Awaited<ReturnType<typeof createClient>>,
  username: string,
  except_user_id?: string,
): Promise<boolean> {
  let q = supabase
    .from('profiles')
    .select('user_id')
    .ilike('username', username)
    .limit(1);
  if (except_user_id) q = q.neq('user_id', except_user_id);
  const { data } = await q;
  return (data?.length ?? 0) > 0;
}

export async function createUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const password = formData.get('password')?.toString() ?? '';
  if (password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  if (await isUsernameTaken(supabase, parsed.value.username)) {
    return { ok: false, error: 'That username is already taken.' };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: parsed.value.email,
    password,
    email_confirm: true,
    user_metadata: {
      display_name: parsed.value.display_name,
      avatar_url: parsed.value.avatar_url,
    },
  });
  if (createErr || !created.user) {
    return { ok: false, error: createErr?.message ?? 'Failed to create user.' };
  }

  // Trigger from migration 0007 has already inserted a profile row keyed by
  // the new auth.users.id. Fill in the fields that aren't synced from auth.
  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      username: parsed.value.username,
      gmail_address: parsed.value.gmail_address,
      contact_number: parsed.value.contact_number,
      role: parsed.value.role,
      avatar_url: parsed.value.avatar_url,
      display_name: parsed.value.display_name,
    })
    .eq('user_id', created.user.id);
  if (profileErr) {
    // The auth user was created. Surface the error so admin can fix manually.
    return { ok: false, error: `User created, but profile update failed: ${profileErr.message}` };
  }

  revalidatePath('/admin/users');
  return { ok: true, error: null };
}

export async function updateUserAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const user_id = formData.get('user_id')?.toString();
  if (!user_id) return { ok: false, error: 'Missing user id.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Prevent the only super admin from demoting themselves into a lockout.
  if (user_id === guard.user.id && parsed.value.role !== 'super_admin') {
    return { ok: false, error: 'You cannot demote yourself from super admin.' };
  }

  const password = formData.get('password')?.toString() ?? '';
  const setPassword = password.length > 0;
  if (setPassword && password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const supabase = await createClient();
  if (await isUsernameTaken(supabase, parsed.value.username, user_id)) {
    return { ok: false, error: 'That username is already taken.' };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const authUpdate: {
    email?: string;
    password?: string;
    user_metadata?: Record<string, unknown>;
  } = {
    email: parsed.value.email,
    user_metadata: {
      display_name: parsed.value.display_name,
      avatar_url: parsed.value.avatar_url,
    },
  };
  if (setPassword) authUpdate.password = password;

  const { error: authErr } = await admin.auth.admin.updateUserById(user_id, authUpdate);
  if (authErr) return { ok: false, error: authErr.message };

  const { error: profileErr } = await admin
    .from('profiles')
    .update({
      username: parsed.value.username,
      gmail_address: parsed.value.gmail_address,
      contact_number: parsed.value.contact_number,
      role: parsed.value.role,
      avatar_url: parsed.value.avatar_url,
      display_name: parsed.value.display_name,
    })
    .eq('user_id', user_id);
  if (profileErr) return { ok: false, error: profileErr.message };

  revalidatePath('/admin/users');
  return { ok: true, error: null };
}

export async function deleteUserAction(user_id: string): Promise<ActionState> {
  const guard = await assertSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!user_id) return { ok: false, error: 'Missing user id.' };
  if (user_id === guard.user.id) {
    return { ok: false, error: 'You cannot delete your own account.' };
  }

  let admin: ReturnType<typeof createAdminClient>;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  const { error } = await admin.auth.admin.deleteUser(user_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/users');
  return { ok: true, error: null };
}
