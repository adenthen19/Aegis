'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { DeliverableStatus } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const STATUSES: DeliverableStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'not_applicable',
];

async function fetchClientId(
  supabase: Awaited<ReturnType<typeof createClient>>,
  client_deliverable_id: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('client_deliverables')
    .select('client_id')
    .eq('client_deliverable_id', client_deliverable_id)
    .maybeSingle();
  return (data?.client_id as string | undefined) ?? null;
}

export async function setDeliverableStatusAction(
  client_deliverable_id: string,
  next_status: DeliverableStatus,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!client_deliverable_id) return { ok: false, error: 'Missing deliverable id.' };
  if (!STATUSES.includes(next_status)) {
    return { ok: false, error: 'Invalid status.' };
  }

  const client_id = await fetchClientId(supabase, client_deliverable_id);

  const { error } = await supabase
    .from('client_deliverables')
    .update({ status: next_status, updated_at: new Date().toISOString() })
    .eq('client_deliverable_id', client_deliverable_id);
  if (error) return { ok: false, error: error.message };

  if (client_id) revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}

export async function bumpDeliverableCountAction(
  client_deliverable_id: string,
  delta: number,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!client_deliverable_id) return { ok: false, error: 'Missing deliverable id.' };
  if (delta !== 1 && delta !== -1) {
    return { ok: false, error: 'Delta must be +1 or -1.' };
  }

  const { data: row, error: fetchErr } = await supabase
    .from('client_deliverables')
    .select('client_id, kind, completed_count, target_count')
    .eq('client_deliverable_id', client_deliverable_id)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };
  if (!row) return { ok: false, error: 'Deliverable not found.' };
  if (row.kind !== 'recurring') {
    return { ok: false, error: 'Only recurring deliverables have a count.' };
  }

  const next = Math.max(0, (row.completed_count as number) + delta);
  const target = (row.target_count as number | null) ?? null;

  const update: {
    completed_count: number;
    updated_at: string;
    status?: DeliverableStatus;
  } = {
    completed_count: next,
    updated_at: new Date().toISOString(),
  };
  if (target != null && next >= target) update.status = 'completed';
  else if (next === 0) update.status = 'pending';
  else update.status = 'in_progress';

  const { error } = await supabase
    .from('client_deliverables')
    .update(update)
    .eq('client_deliverable_id', client_deliverable_id);
  if (error) return { ok: false, error: error.message };

  if (row.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}

export async function setDeliverableNotesAction(
  client_deliverable_id: string,
  notes: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!client_deliverable_id) return { ok: false, error: 'Missing deliverable id.' };

  const trimmed = notes.trim();
  const client_id = await fetchClientId(supabase, client_deliverable_id);

  const { error } = await supabase
    .from('client_deliverables')
    .update({
      notes: trimmed.length === 0 ? null : trimmed,
      updated_at: new Date().toISOString(),
    })
    .eq('client_deliverable_id', client_deliverable_id);
  if (error) return { ok: false, error: error.message };

  if (client_id) revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}

export async function deleteClientDeliverableAction(
  client_deliverable_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!client_deliverable_id) return { ok: false, error: 'Missing deliverable id.' };

  const client_id = await fetchClientId(supabase, client_deliverable_id);

  const { error } = await supabase
    .from('client_deliverables')
    .delete()
    .eq('client_deliverable_id', client_deliverable_id);
  if (error) return { ok: false, error: error.message };

  if (client_id) revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}
