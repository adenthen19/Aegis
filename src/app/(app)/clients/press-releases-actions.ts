'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  DeliverableStatus,
  PressReleaseStatus,
  PressReleaseType,
} from '@/lib/types';
import { getActiveEngagementForClient } from './engagements-helpers';

export type ActionState = { ok: boolean; error: string | null };

const TYPES: PressReleaseType[] = [
  'results',
  'corporate_action',
  'ipo',
  'agm_egm',
  'esg',
  'product',
  'crisis',
  'ad_hoc',
  'other',
];

const STATUSES: PressReleaseStatus[] = ['draft', 'approved', 'distributed', 'archived'];

type PressReleasePayload = {
  client_id: string;
  engagement_id: string | null;
  client_deliverable_id: string | null;
  title: string;
  release_type: PressReleaseType;
  status: PressReleaseStatus;
  release_date: string | null;
  distributed_at: string | null;
  body: string | null;
  distribution_media_ids: string[];
  distribution_notes: string | null;
  notes: string | null;
};

function readPayload(formData: FormData):
  | { ok: true; value: PressReleasePayload }
  | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const title = formData.get('title')?.toString().trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const type_raw = formData.get('release_type')?.toString();
  if (!type_raw || !TYPES.includes(type_raw as PressReleaseType)) {
    return { ok: false, error: 'Pick a release type.' };
  }

  const status_raw = formData.get('status')?.toString() ?? 'draft';
  if (!STATUSES.includes(status_raw as PressReleaseStatus)) {
    return { ok: false, error: 'Invalid status.' };
  }

  const release_date_raw = formData.get('release_date')?.toString();
  const release_date = release_date_raw && release_date_raw.length > 0 ? release_date_raw : null;

  const distribution_media_ids = formData
    .getAll('distribution_media_id')
    .map((v) => v.toString())
    .filter((v) => v.length > 0);

  return {
    ok: true,
    value: {
      client_id,
      engagement_id: formData.get('engagement_id')?.toString() || null,
      client_deliverable_id: formData.get('client_deliverable_id')?.toString() || null,
      title,
      release_type: type_raw as PressReleaseType,
      status: status_raw as PressReleaseStatus,
      release_date,
      distributed_at: null,
      body: formData.get('body')?.toString().trim() || null,
      distribution_media_ids,
      distribution_notes: formData.get('distribution_notes')?.toString().trim() || null,
      notes: formData.get('notes')?.toString().trim() || null,
    },
  };
}

async function bumpCommitmentForDistribution(
  supabase: Awaited<ReturnType<typeof createClient>>,
  client_deliverable_id: string,
  delta: 1 | -1,
): Promise<void> {
  const { data: row } = await supabase
    .from('client_deliverables')
    .select('completed_count, target_count, kind')
    .eq('client_deliverable_id', client_deliverable_id)
    .maybeSingle();
  if (!row) return;

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
  await supabase
    .from('client_deliverables')
    .update(update)
    .eq('client_deliverable_id', client_deliverable_id);
}

export async function createPressReleaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Default-attach to the active engagement if the form didn't pick one.
  let engagement_id = parsed.value.engagement_id;
  if (!engagement_id) {
    const active = await getActiveEngagementForClient(supabase, parsed.value.client_id);
    engagement_id = active?.engagement_id ?? null;
  }

  const distributed_at =
    parsed.value.status === 'distributed' ? new Date().toISOString() : null;

  const { error } = await supabase.from('press_releases').insert({
    ...parsed.value,
    engagement_id,
    distributed_at,
  });
  if (error) return { ok: false, error: error.message };

  // If created already at "distributed", bump the linked commitment counter.
  if (
    parsed.value.status === 'distributed' &&
    parsed.value.client_deliverable_id
  ) {
    await bumpCommitmentForDistribution(
      supabase,
      parsed.value.client_deliverable_id,
      1,
    );
  }

  revalidatePath(`/clients/${parsed.value.client_id}`);
  return { ok: true, error: null };
}

export async function updatePressReleaseAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const press_release_id = formData.get('press_release_id')?.toString();
  if (!press_release_id) return { ok: false, error: 'Missing press release id.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // Capture pre-update state to keep the commitment counter consistent.
  const { data: before } = await supabase
    .from('press_releases')
    .select('status, distributed_at, client_deliverable_id')
    .eq('press_release_id', press_release_id)
    .maybeSingle();

  const wasDistributed = before?.status === 'distributed';
  const isNowDistributed = parsed.value.status === 'distributed';
  const distributed_at = isNowDistributed
    ? ((before?.distributed_at as string | null) ?? new Date().toISOString())
    : null;

  const { error } = await supabase
    .from('press_releases')
    .update({ ...parsed.value, distributed_at })
    .eq('press_release_id', press_release_id);
  if (error) return { ok: false, error: error.message };

  // Counter sync. Only bump if a commitment is linked. Use the *new* link
  // from the payload, falling back to the pre-update one.
  const linked_id =
    parsed.value.client_deliverable_id ??
    (before?.client_deliverable_id as string | null) ??
    null;
  if (linked_id) {
    if (!wasDistributed && isNowDistributed) {
      await bumpCommitmentForDistribution(supabase, linked_id, 1);
    } else if (wasDistributed && !isNowDistributed) {
      await bumpCommitmentForDistribution(supabase, linked_id, -1);
    }
  }

  revalidatePath(`/clients/${parsed.value.client_id}`);
  return { ok: true, error: null };
}

export async function setPressReleaseStatusAction(
  press_release_id: string,
  next: PressReleaseStatus,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!press_release_id) return { ok: false, error: 'Missing press release id.' };
  if (!STATUSES.includes(next)) return { ok: false, error: 'Invalid status.' };

  const { data: before } = await supabase
    .from('press_releases')
    .select('client_id, status, distributed_at, client_deliverable_id')
    .eq('press_release_id', press_release_id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Press release not found.' };

  const wasDistributed = before.status === 'distributed';
  const isNowDistributed = next === 'distributed';
  const distributed_at = isNowDistributed
    ? ((before.distributed_at as string | null) ?? new Date().toISOString())
    : null;

  const { error } = await supabase
    .from('press_releases')
    .update({ status: next, distributed_at })
    .eq('press_release_id', press_release_id);
  if (error) return { ok: false, error: error.message };

  if (before.client_deliverable_id) {
    if (!wasDistributed && isNowDistributed) {
      await bumpCommitmentForDistribution(
        supabase,
        before.client_deliverable_id as string,
        1,
      );
    } else if (wasDistributed && !isNowDistributed) {
      await bumpCommitmentForDistribution(
        supabase,
        before.client_deliverable_id as string,
        -1,
      );
    }
  }

  revalidatePath(`/clients/${before.client_id}`);
  return { ok: true, error: null };
}

export async function deletePressReleaseAction(
  press_release_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!press_release_id) return { ok: false, error: 'Missing press release id.' };

  const { data: before } = await supabase
    .from('press_releases')
    .select('client_id, status, client_deliverable_id')
    .eq('press_release_id', press_release_id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Press release not found.' };

  const { error } = await supabase
    .from('press_releases')
    .delete()
    .eq('press_release_id', press_release_id);
  if (error) return { ok: false, error: error.message };

  // If we deleted a distributed release linked to a commitment, decrement the
  // counter so the on-track view doesn't drift.
  if (
    before.status === 'distributed' &&
    before.client_deliverable_id
  ) {
    await bumpCommitmentForDistribution(
      supabase,
      before.client_deliverable_id as string,
      -1,
    );
  }

  revalidatePath(`/clients/${before.client_id}`);
  return { ok: true, error: null };
}
