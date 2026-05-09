'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
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
// Atomic via RPC (migration 0037) so concurrent flips don't lose count.
async function bumpCommitment(
  supabase: Awaited<ReturnType<typeof createClient>>,
  client_deliverable_id: string,
  delta: 1 | -1,
): Promise<void> {
  await supabase.rpc('bump_deliverable_counter', {
    p_deliverable_id: client_deliverable_id,
    p_delta: delta,
  });
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

  // Pull client_id from the existing row so we refuse cross-client
  // tampering — a user can't rebind the interview to a different
  // client by tampering with the hidden form field.
  const { data: before } = await supabase
    .from('media_interviews')
    .select('client_id, status, client_deliverable_id')
    .eq('interview_id', interview_id)
    .maybeSingle();
  if (!before) return { ok: false, error: 'Interview not found.' };
  const originalClientId = before.client_id as string;

  // Strip client_id from the update payload.
  const { client_id: _ignored, ...mutable } = parsed.value;
  void _ignored;

  const { error } = await supabase
    .from('media_interviews')
    .update(mutable)
    .eq('interview_id', interview_id)
    .eq('client_id', originalClientId);
  if (error) return { ok: false, error: error.message };

  // Counter sync. Use the new link from the payload, falling back to before.
  const linked_id =
    parsed.value.client_deliverable_id ??
    (before.client_deliverable_id as string | null) ??
    null;
  if (linked_id) {
    const wasCompleted = before.status === 'completed';
    const isNowCompleted = parsed.value.status === 'completed';
    if (!wasCompleted && isNowCompleted) {
      await bumpCommitment(supabase, linked_id, 1);
    } else if (wasCompleted && !isNowCompleted) {
      await bumpCommitment(supabase, linked_id, -1);
    }
  }

  revalidatePath(`/clients/${originalClientId}`);
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
