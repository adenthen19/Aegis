'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  DeliverableStatus,
  InterviewFormat,
  InterviewStatus,
} from '@/lib/types';
import { getActiveEngagementForClient } from './engagements-helpers';

export type ActionState = { ok: boolean; error: string | null };

const FORMATS: InterviewFormat[] = ['in_person', 'phone', 'video', 'email'];
const STATUSES: InterviewStatus[] = [
  'scheduled',
  'completed',
  'cancelled',
  'postponed',
];

type InterviewPayload = {
  client_id: string;
  engagement_id: string | null;
  client_deliverable_id: string | null;
  media_id: string | null;
  publication_name: string | null;
  reporter_name: string | null;
  spokesperson_name: string | null;
  interview_date: string;
  interview_format: InterviewFormat;
  status: InterviewStatus;
  topic: string | null;
  expected_publish_date: string | null;
  coverage_id: string | null;
  notes: string | null;
};

function readPayload(
  formData: FormData,
): { ok: true; value: InterviewPayload } | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const interview_date = formData.get('interview_date')?.toString();
  if (!interview_date) return { ok: false, error: 'Interview date is required.' };

  const format_raw = formData.get('interview_format')?.toString() ?? 'in_person';
  if (!FORMATS.includes(format_raw as InterviewFormat)) {
    return { ok: false, error: 'Invalid format.' };
  }

  const status_raw = formData.get('status')?.toString() ?? 'scheduled';
  if (!STATUSES.includes(status_raw as InterviewStatus)) {
    return { ok: false, error: 'Invalid status.' };
  }

  // Outlet: must have either a structured media_id or a publication name.
  const media_id = formData.get('media_id')?.toString().trim() || null;
  const publication_name =
    formData.get('publication_name')?.toString().trim() || null;
  if (!media_id && !publication_name) {
    return {
      ok: false,
      error: 'Pick a media outlet or enter a publication name (ad-hoc).',
    };
  }

  const expected_publish_date_raw = formData
    .get('expected_publish_date')
    ?.toString();
  const expected_publish_date =
    expected_publish_date_raw && expected_publish_date_raw.length > 0
      ? expected_publish_date_raw
      : null;

  return {
    ok: true,
    value: {
      client_id,
      engagement_id: formData.get('engagement_id')?.toString() || null,
      client_deliverable_id:
        formData.get('client_deliverable_id')?.toString() || null,
      media_id,
      publication_name,
      reporter_name: formData.get('reporter_name')?.toString().trim() || null,
      spokesperson_name:
        formData.get('spokesperson_name')?.toString().trim() || null,
      interview_date,
      interview_format: format_raw as InterviewFormat,
      status: status_raw as InterviewStatus,
      topic: formData.get('topic')?.toString().trim() || null,
      expected_publish_date,
      coverage_id: formData.get('coverage_id')?.toString() || null,
      notes: formData.get('notes')?.toString().trim() || null,
    },
  };
}

// Counter sync — a completed interview bumps the linked recurring "media
// interviews" commitment so the engagement's on-track view stays accurate.
// Mirrors the pattern used by press releases + deliverable schedule.
async function bumpCommitment(
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

export async function createMediaInterviewAction(
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

  const { error } = await supabase
    .from('media_interviews')
    .insert({ ...parsed.value, engagement_id });
  if (error) return { ok: false, error: error.message };

  if (
    parsed.value.status === 'completed' &&
    parsed.value.client_deliverable_id
  ) {
    await bumpCommitment(supabase, parsed.value.client_deliverable_id, 1);
  }

  revalidatePath(`/clients/${parsed.value.client_id}`);
  revalidatePath('/media-interviews');
  return { ok: true, error: null };
}

export async function updateMediaInterviewAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const interview_id = formData.get('interview_id')?.toString();
  if (!interview_id) return { ok: false, error: 'Missing interview id.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { data: before } = await supabase
    .from('media_interviews')
    .select('status, client_deliverable_id')
    .eq('interview_id', interview_id)
    .maybeSingle();

  const { error } = await supabase
    .from('media_interviews')
    .update(parsed.value)
    .eq('interview_id', interview_id);
  if (error) return { ok: false, error: error.message };

  // Counter sync. Use the new link from the payload, falling back to before.
  const linked_id =
    parsed.value.client_deliverable_id ??
    (before?.client_deliverable_id as string | null) ??
    null;
  if (linked_id) {
    const wasCompleted = before?.status === 'completed';
    const isNowCompleted = parsed.value.status === 'completed';
    if (!wasCompleted && isNowCompleted) {
      await bumpCommitment(supabase, linked_id, 1);
    } else if (wasCompleted && !isNowCompleted) {
      await bumpCommitment(supabase, linked_id, -1);
    }
  }

  revalidatePath(`/clients/${parsed.value.client_id}`);
  revalidatePath('/media-interviews');
  return { ok: true, error: null };
}

export async function setMediaInterviewStatusAction(
  interview_id: string,
  next: InterviewStatus,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!interview_id) return { ok: false, error: 'Missing interview id.' };
  if (!STATUSES.includes(next)) return { ok: false, error: 'Invalid status.' };

  const { data: before } = await supabase
    .from('media_interviews')
    .select('client_id, status, client_deliverable_id')
    .eq('interview_id', interview_id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Interview not found.' };

  if (before.status === next) return { ok: true, error: null };

  const { error } = await supabase
    .from('media_interviews')
    .update({ status: next })
    .eq('interview_id', interview_id);
  if (error) return { ok: false, error: error.message };

  if (before.client_deliverable_id) {
    const wasCompleted = before.status === 'completed';
    const isNowCompleted = next === 'completed';
    if (!wasCompleted && isNowCompleted) {
      await bumpCommitment(supabase, before.client_deliverable_id as string, 1);
    } else if (wasCompleted && !isNowCompleted) {
      await bumpCommitment(supabase, before.client_deliverable_id as string, -1);
    }
  }

  revalidatePath(`/clients/${before.client_id as string}`);
  revalidatePath('/media-interviews');
  return { ok: true, error: null };
}

export async function deleteMediaInterviewAction(
  interview_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!interview_id) return { ok: false, error: 'Missing interview id.' };

  const { data: before } = await supabase
    .from('media_interviews')
    .select('client_id, status, client_deliverable_id')
    .eq('interview_id', interview_id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Interview not found.' };

  const { error } = await supabase
    .from('media_interviews')
    .delete()
    .eq('interview_id', interview_id);
  if (error) return { ok: false, error: error.message };

  // If we deleted a completed interview linked to a commitment, decrement.
  if (before.status === 'completed' && before.client_deliverable_id) {
    await bumpCommitment(supabase, before.client_deliverable_id as string, -1);
  }

  revalidatePath(`/clients/${before.client_id as string}`);
  revalidatePath('/media-interviews');
  return { ok: true, error: null };
}
