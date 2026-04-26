'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { StakeholderCategory } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const CATEGORIES: StakeholderCategory[] = ['executive', 'board', 'advisor', 'other'];

type StakeholderPayload = {
  client_id: string;
  category: StakeholderCategory;
  role: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  is_primary: boolean;
  notes: string | null;
};

function readPayload(formData: FormData):
  | { ok: true; value: StakeholderPayload }
  | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const category_raw = formData.get('category')?.toString();
  if (!category_raw || !CATEGORIES.includes(category_raw as StakeholderCategory)) {
    return { ok: false, error: 'Pick a category.' };
  }

  const role = formData.get('role')?.toString().trim();
  if (!role) return { ok: false, error: 'Role is required.' };

  const full_name = formData.get('full_name')?.toString().trim();
  if (!full_name) return { ok: false, error: 'Name is required.' };

  return {
    ok: true,
    value: {
      client_id,
      category: category_raw as StakeholderCategory,
      role,
      full_name,
      email: formData.get('email')?.toString().trim().toLowerCase() || null,
      phone: formData.get('phone')?.toString().trim() || null,
      is_primary: formData.get('is_primary') === 'true',
      notes: formData.get('notes')?.toString().trim() || null,
    },
  };
}

async function clearPrimaryFlag(
  supabase: Awaited<ReturnType<typeof createClient>>,
  client_id: string,
  except_stakeholder_id?: string,
): Promise<void> {
  // Only one primary per client. The unique partial index would block a
  // duplicate, but proactively clearing makes the UX feel like "promote this
  // one" rather than throwing an error.
  let q = supabase
    .from('client_stakeholders')
    .update({ is_primary: false })
    .eq('client_id', client_id)
    .eq('is_primary', true);
  if (except_stakeholder_id) q = q.neq('stakeholder_id', except_stakeholder_id);
  await q;
}

export async function createStakeholderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (parsed.value.is_primary) {
    await clearPrimaryFlag(supabase, parsed.value.client_id);
  }

  const { error } = await supabase
    .from('client_stakeholders')
    .insert(parsed.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${parsed.value.client_id}`);
  return { ok: true, error: null };
}

export async function updateStakeholderAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const stakeholder_id = formData.get('stakeholder_id')?.toString();
  if (!stakeholder_id) return { ok: false, error: 'Missing stakeholder id.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  if (parsed.value.is_primary) {
    await clearPrimaryFlag(supabase, parsed.value.client_id, stakeholder_id);
  }

  const { error } = await supabase
    .from('client_stakeholders')
    .update(parsed.value)
    .eq('stakeholder_id', stakeholder_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${parsed.value.client_id}`);
  return { ok: true, error: null };
}

export async function deleteStakeholderAction(
  stakeholder_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!stakeholder_id) return { ok: false, error: 'Missing stakeholder id.' };

  const { data: row } = await supabase
    .from('client_stakeholders')
    .select('client_id')
    .eq('stakeholder_id', stakeholder_id)
    .maybeSingle();

  const { error } = await supabase
    .from('client_stakeholders')
    .delete()
    .eq('stakeholder_id', stakeholder_id);
  if (error) return { ok: false, error: error.message };

  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}
