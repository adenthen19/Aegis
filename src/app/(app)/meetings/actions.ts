'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { MeetingFormat } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const FORMATS: MeetingFormat[] = ['physical', 'online'];

type MeetingPayload = {
  client_id: string | null;
  investor_id: string | null;
  meeting_format: MeetingFormat;
  meeting_date: string;
  attendees: string | null;
  key_takeaways: string | null;
};

function readPayload(formData: FormData): { ok: true; value: MeetingPayload } | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString() || null;
  const investor_id = formData.get('investor_id')?.toString() || null;
  const format_raw = formData.get('meeting_format')?.toString();
  const meeting_date = formData.get('meeting_date')?.toString();
  const attendees = formData.get('attendees')?.toString().trim() || null;
  const key_takeaways = formData.get('key_takeaways')?.toString().trim() || null;

  if (!format_raw || !FORMATS.includes(format_raw as MeetingFormat)) {
    return { ok: false, error: 'Meeting format is required.' };
  }
  if (!meeting_date) return { ok: false, error: 'Meeting date is required.' };
  if (!client_id && !investor_id) {
    return { ok: false, error: 'Link the meeting to at least a client or an investor.' };
  }

  return {
    ok: true,
    value: {
      client_id,
      investor_id,
      meeting_format: format_raw as MeetingFormat,
      meeting_date,
      attendees,
      key_takeaways,
    },
  };
}

export async function createMeetingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('meetings').insert(payload.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/meetings');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateMeetingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const meeting_id = formData.get('meeting_id')?.toString();
  if (!meeting_id) return { ok: false, error: 'Missing meeting id.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('meetings').update(payload.value).eq('meeting_id', meeting_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/meetings');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function deleteMeetingAction(meeting_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!meeting_id) return { ok: false, error: 'Missing meeting id.' };

  const { error } = await supabase.from('meetings').delete().eq('meeting_id', meeting_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/meetings');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}
