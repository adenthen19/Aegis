'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  DeliverableKind,
  DeliverableStatus,
  ScheduleStatus,
  ServiceTier,
} from '@/lib/types';
import { SERVICE_TIER_CODES as SERVICE_TIERS } from '@/lib/client-import';

export type ActionState = { ok: boolean; error: string | null };

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

const STATUSES: ScheduleStatus[] = ['planned', 'confirmed', 'completed', 'cancelled'];
const KINDS: DeliverableKind[] = ['one_off', 'recurring', 'event_triggered', 'ongoing'];

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────

async function fetchParent(
  supabase: SupabaseClient,
  client_deliverable_id: string,
): Promise<
  | { client_id: string; kind: DeliverableKind; target_count: number | null }
  | null
> {
  const { data } = await supabase
    .from('client_deliverables')
    .select('client_id, kind, target_count')
    .eq('client_deliverable_id', client_deliverable_id)
    .maybeSingle();
  if (!data) return null;
  return {
    client_id: data.client_id as string,
    kind: data.kind as DeliverableKind,
    target_count: (data.target_count as number | null) ?? null,
  };
}

async function fetchScheduleParent(
  supabase: SupabaseClient,
  schedule_id: string,
): Promise<
  | {
      client_deliverable_id: string;
      client_id: string;
      kind: DeliverableKind;
      target_count: number | null;
      status: ScheduleStatus;
    }
  | null
> {
  const { data } = await supabase
    .from('deliverable_schedule')
    .select(
      'client_deliverable_id, status, client_deliverables ( client_id, kind, target_count )',
    )
    .eq('schedule_id', schedule_id)
    .maybeSingle();
  if (!data) return null;
  const cd = data.client_deliverables as unknown as
    | { client_id: string; kind: DeliverableKind; target_count: number | null }
    | null;
  if (!cd) return null;
  return {
    client_deliverable_id: data.client_deliverable_id as string,
    status: data.status as ScheduleStatus,
    client_id: cd.client_id,
    kind: cd.kind,
    target_count: cd.target_count,
  };
}

async function applyCounterDelta(
  supabase: SupabaseClient,
  client_deliverable_id: string,
  delta: -1 | 1,
): Promise<{ error: string | null }> {
  const { data: row, error: fetchErr } = await supabase
    .from('client_deliverables')
    .select('completed_count, target_count, kind')
    .eq('client_deliverable_id', client_deliverable_id)
    .maybeSingle();
  if (fetchErr) return { error: fetchErr.message };
  if (!row) return { error: null };

  const current = (row.completed_count as number) ?? 0;
  const next = Math.max(0, current + delta);
  const target = (row.target_count as number | null) ?? null;

  const update: {
    completed_count: number;
    updated_at: string;
    status?: DeliverableStatus;
  } = {
    completed_count: next,
    updated_at: new Date().toISOString(),
  };
  if (row.kind === 'recurring' && target != null && next >= target) {
    update.status = 'completed';
  } else if (next === 0) {
    update.status = 'pending';
  } else {
    update.status = 'in_progress';
  }

  const { error } = await supabase
    .from('client_deliverables')
    .update(update)
    .eq('client_deliverable_id', client_deliverable_id);
  return { error: error?.message ?? null };
}

// ─────────────────────────────────────────────────────────────────────────
// Schedule CRUD
// ─────────────────────────────────────────────────────────────────────────

export async function createScheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const client_deliverable_id = formData.get('client_deliverable_id')?.toString();
  if (!client_deliverable_id) return { ok: false, error: 'Missing commitment id.' };

  const scheduled_at = formData.get('scheduled_at')?.toString();
  if (!scheduled_at) return { ok: false, error: 'Date & time is required.' };

  const location = formData.get('location')?.toString().trim() || null;
  const notes = formData.get('notes')?.toString().trim() || null;
  const status_raw = formData.get('status')?.toString() ?? 'planned';
  const status: ScheduleStatus = STATUSES.includes(status_raw as ScheduleStatus)
    ? (status_raw as ScheduleStatus)
    : 'planned';

  const parent = await fetchParent(supabase, client_deliverable_id);
  if (!parent) return { ok: false, error: 'Commitment not found.' };

  const { data: created, error } = await supabase
    .from('deliverable_schedule')
    .insert({ client_deliverable_id, scheduled_at, location, notes, status })
    .select('schedule_id')
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Failed to create session.' };
  }

  if (status === 'completed') {
    const r = await applyCounterDelta(supabase, client_deliverable_id, 1);
    if (r.error) return { ok: false, error: r.error };
  }

  revalidatePath(`/clients/${parent.client_id}`);
  return { ok: true, error: null };
}

export async function updateScheduleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const schedule_id = formData.get('schedule_id')?.toString();
  if (!schedule_id) return { ok: false, error: 'Missing session id.' };

  const scheduled_at = formData.get('scheduled_at')?.toString();
  if (!scheduled_at) return { ok: false, error: 'Date & time is required.' };

  const location = formData.get('location')?.toString().trim() || null;
  const notes = formData.get('notes')?.toString().trim() || null;
  const status_raw = formData.get('status')?.toString() ?? 'planned';
  const next_status: ScheduleStatus = STATUSES.includes(status_raw as ScheduleStatus)
    ? (status_raw as ScheduleStatus)
    : 'planned';

  const before = await fetchScheduleParent(supabase, schedule_id);
  if (!before) return { ok: false, error: 'Session not found.' };

  const { error } = await supabase
    .from('deliverable_schedule')
    .update({
      scheduled_at,
      location,
      notes,
      status: next_status,
      updated_at: new Date().toISOString(),
    })
    .eq('schedule_id', schedule_id);
  if (error) return { ok: false, error: error.message };

  const wasCompleted = before.status === 'completed';
  const nowCompleted = next_status === 'completed';
  if (!wasCompleted && nowCompleted) {
    const r = await applyCounterDelta(supabase, before.client_deliverable_id, 1);
    if (r.error) return { ok: false, error: r.error };
  } else if (wasCompleted && !nowCompleted) {
    const r = await applyCounterDelta(supabase, before.client_deliverable_id, -1);
    if (r.error) return { ok: false, error: r.error };
  }

  revalidatePath(`/clients/${before.client_id}`);
  return { ok: true, error: null };
}

export async function setScheduleStatusAction(
  schedule_id: string,
  next_status: ScheduleStatus,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!schedule_id) return { ok: false, error: 'Missing session id.' };
  if (!STATUSES.includes(next_status)) return { ok: false, error: 'Invalid status.' };

  const before = await fetchScheduleParent(supabase, schedule_id);
  if (!before) return { ok: false, error: 'Session not found.' };

  if (before.status === next_status) return { ok: true, error: null };

  const { error } = await supabase
    .from('deliverable_schedule')
    .update({ status: next_status, updated_at: new Date().toISOString() })
    .eq('schedule_id', schedule_id);
  if (error) return { ok: false, error: error.message };

  const wasCompleted = before.status === 'completed';
  const nowCompleted = next_status === 'completed';
  if (!wasCompleted && nowCompleted) {
    const r = await applyCounterDelta(supabase, before.client_deliverable_id, 1);
    if (r.error) return { ok: false, error: r.error };
  } else if (wasCompleted && !nowCompleted) {
    const r = await applyCounterDelta(supabase, before.client_deliverable_id, -1);
    if (r.error) return { ok: false, error: r.error };
  }

  revalidatePath(`/clients/${before.client_id}`);
  return { ok: true, error: null };
}

export async function deleteScheduleAction(
  schedule_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!schedule_id) return { ok: false, error: 'Missing session id.' };

  const before = await fetchScheduleParent(supabase, schedule_id);
  if (!before) return { ok: false, error: 'Session not found.' };

  const { error } = await supabase
    .from('deliverable_schedule')
    .delete()
    .eq('schedule_id', schedule_id);
  if (error) return { ok: false, error: error.message };

  if (before.status === 'completed') {
    const r = await applyCounterDelta(supabase, before.client_deliverable_id, -1);
    if (r.error) return { ok: false, error: r.error };
  }

  revalidatePath(`/clients/${before.client_id}`);
  return { ok: true, error: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Attendees
// ─────────────────────────────────────────────────────────────────────────

export async function addAnalystAttendeeAction(
  schedule_id: string,
  investor_id: string,
  note: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!schedule_id || !investor_id) {
    return { ok: false, error: 'Missing session or analyst.' };
  }

  const before = await fetchScheduleParent(supabase, schedule_id);
  if (!before) return { ok: false, error: 'Session not found.' };

  const trimmedNote = note?.trim() || null;
  const { error } = await supabase
    .from('deliverable_schedule_attendees')
    .insert({ schedule_id, investor_id, note: trimmedNote });
  if (error) {
    if (error.code === '23505') {
      return { ok: false, error: 'That analyst is already on this session.' };
    }
    return { ok: false, error: error.message };
  }

  revalidatePath(`/clients/${before.client_id}`);
  return { ok: true, error: null };
}

export async function addAdhocAttendeeAction(
  schedule_id: string,
  name: string,
  affiliation: string | null,
  note: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!schedule_id) return { ok: false, error: 'Missing session id.' };

  const trimmedName = name.trim();
  if (!trimmedName) return { ok: false, error: 'Name is required.' };

  const before = await fetchScheduleParent(supabase, schedule_id);
  if (!before) return { ok: false, error: 'Session not found.' };

  const { error } = await supabase.from('deliverable_schedule_attendees').insert({
    schedule_id,
    name: trimmedName,
    affiliation: affiliation?.trim() || null,
    note: note?.trim() || null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${before.client_id}`);
  return { ok: true, error: null };
}

export async function removeAttendeeAction(
  attendee_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!attendee_id) return { ok: false, error: 'Missing attendee id.' };

  const { data: row } = await supabase
    .from('deliverable_schedule_attendees')
    .select(
      'schedule_id, deliverable_schedule ( client_deliverables ( client_id ) )',
    )
    .eq('attendee_id', attendee_id)
    .maybeSingle();

  const { error } = await supabase
    .from('deliverable_schedule_attendees')
    .delete()
    .eq('attendee_id', attendee_id);
  if (error) return { ok: false, error: error.message };

  const ds = row?.deliverable_schedule as unknown as
    | { client_deliverables: { client_id: string } | null }
    | null;
  const client_id = ds?.client_deliverables?.client_id;
  if (client_id) revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}

// ─────────────────────────────────────────────────────────────────────────
// Custom (non-template) commitment
// ─────────────────────────────────────────────────────────────────────────

export async function addCustomCommitmentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const tier_raw = formData.get('service_tier')?.toString();
  if (!tier_raw || !SERVICE_TIERS.includes(tier_raw as ServiceTier)) {
    return { ok: false, error: 'Pick a service tier.' };
  }
  const kind_raw = formData.get('kind')?.toString();
  if (!kind_raw || !KINDS.includes(kind_raw as DeliverableKind)) {
    return { ok: false, error: 'Pick a kind.' };
  }
  const label = formData.get('label')?.toString().trim();
  if (!label) return { ok: false, error: 'Label is required.' };

  const kind = kind_raw as DeliverableKind;
  let target_count: number | null = null;
  if (kind === 'recurring') {
    const raw = formData.get('target_count')?.toString().trim() ?? '';
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: 'Recurring commitments need a target count greater than 0.' };
    }
    target_count = n;
  }

  const { error } = await supabase.from('client_deliverables').insert({
    client_id,
    template_id: null,
    service_tier: tier_raw as ServiceTier,
    kind,
    label,
    target_count,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}
