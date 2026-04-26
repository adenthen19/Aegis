'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ActionItemStatus, MeetingFormat, MeetingType } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const FORMATS: MeetingFormat[] = ['physical', 'online'];
const TYPES: MeetingType[] = ['internal', 'briefing'];

type MeetingPayload = {
  meeting_type: MeetingType;
  client_id: string | null;
  investor_id: string | null;
  meeting_format: MeetingFormat;
  meeting_date: string;
  location: string | null;
  attendees: string | null;
  agenda_items: string[];
  summary: string | null;
  other_remarks: string | null;
};

type IncomingActionItem = {
  action_item_id: string | null; // null = new row to insert
  item: string;
  pic_user_id: string | null;
  due_date: string | null;
};

type ParsedForm = {
  meeting: MeetingPayload;
  attendee_user_ids: string[];
  action_items: IncomingActionItem[];
};

function readForm(formData: FormData): { ok: true; value: ParsedForm } | { ok: false; error: string } {
  const type_raw = formData.get('meeting_type')?.toString();
  const meeting_type = TYPES.includes(type_raw as MeetingType) ? (type_raw as MeetingType) : null;
  if (!meeting_type) return { ok: false, error: 'Meeting type is required.' };

  const client_id = formData.get('client_id')?.toString() || null;
  const investor_id = formData.get('investor_id')?.toString() || null;
  const format_raw = formData.get('meeting_format')?.toString();
  const meeting_date = formData.get('meeting_date')?.toString();
  const location = formData.get('location')?.toString().trim() || null;
  const summary = formData.get('summary')?.toString().trim() || null;
  const other_remarks = formData.get('other_remarks')?.toString().trim() || null;

  if (!format_raw || !FORMATS.includes(format_raw as MeetingFormat)) {
    return { ok: false, error: 'Meeting format is required.' };
  }
  if (!meeting_date) return { ok: false, error: 'Meeting date is required.' };

  if (meeting_type === 'briefing' && !client_id && !investor_id) {
    return { ok: false, error: 'Briefings must be linked to a client or investor.' };
  }

  const agenda_items = formData
    .getAll('agenda_item')
    .map((v) => v.toString().trim())
    .filter((v) => v.length > 0);

  const attendee_user_ids = Array.from(
    new Set(
      formData
        .getAll('attendee_user_id')
        .map((v) => v.toString())
        .filter((v) => v.length > 0),
    ),
  );

  // Action items arrive as parallel arrays. Ignore rows with empty item text.
  const aiIds = formData.getAll('action_item_id').map((v) => v.toString());
  const aiTexts = formData.getAll('action_item_text').map((v) => v.toString().trim());
  const aiPics = formData.getAll('action_item_pic').map((v) => v.toString());
  const aiDues = formData.getAll('action_item_due').map((v) => v.toString());

  const action_items: IncomingActionItem[] = [];
  for (let i = 0; i < aiTexts.length; i += 1) {
    const item = aiTexts[i];
    if (!item) continue; // skip blank rows
    action_items.push({
      action_item_id: aiIds[i] && aiIds[i].length > 0 ? aiIds[i] : null,
      item,
      pic_user_id: aiPics[i] && aiPics[i].length > 0 ? aiPics[i] : null,
      due_date: aiDues[i] && aiDues[i].length > 0 ? aiDues[i] : null,
    });
  }

  // Free-text attendees field is no longer in the form; null it so we don't
  // carry stale data across edits. Old rows keep whatever they had until edited.
  const attendees: string | null = null;

  return {
    ok: true,
    value: {
      meeting: {
        meeting_type,
        client_id: meeting_type === 'internal' ? null : client_id,
        investor_id: meeting_type === 'internal' ? null : investor_id,
        meeting_format: format_raw as MeetingFormat,
        meeting_date,
        location,
        attendees,
        agenda_items,
        summary,
        other_remarks,
      },
      attendee_user_ids,
      action_items,
    },
  };
}

async function syncAttendees(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meeting_id: string,
  user_ids: string[],
): Promise<{ error: string | null }> {
  const { error: delErr } = await supabase
    .from('meeting_attendees')
    .delete()
    .eq('meeting_id', meeting_id);
  if (delErr) return { error: delErr.message };

  if (user_ids.length === 0) return { error: null };

  const { error: insErr } = await supabase
    .from('meeting_attendees')
    .insert(user_ids.map((user_id) => ({ meeting_id, user_id })));
  if (insErr) return { error: insErr.message };
  return { error: null };
}

async function syncActionItems(
  supabase: Awaited<ReturnType<typeof createClient>>,
  meeting_id: string,
  incoming: IncomingActionItem[],
): Promise<{ error: string | null }> {
  // Fetch existing rows for this meeting to compute the diff.
  const { data: existing, error: fetchErr } = await supabase
    .from('action_items')
    .select('action_item_id')
    .eq('meeting_id', meeting_id);
  if (fetchErr) return { error: fetchErr.message };

  const existingIds = new Set((existing ?? []).map((r) => r.action_item_id as string));
  const incomingIds = new Set(
    incoming.map((r) => r.action_item_id).filter((id): id is string => Boolean(id)),
  );

  const toDelete = [...existingIds].filter((id) => !incomingIds.has(id));
  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('action_items')
      .delete()
      .in('action_item_id', toDelete);
    if (delErr) return { error: delErr.message };
  }

  for (const row of incoming) {
    if (row.action_item_id) {
      // Update existing — preserve status and completed_at.
      const { error: updErr } = await supabase
        .from('action_items')
        .update({
          item: row.item,
          pic_user_id: row.pic_user_id,
          due_date: row.due_date,
          updated_at: new Date().toISOString(),
        })
        .eq('action_item_id', row.action_item_id);
      if (updErr) return { error: updErr.message };
    } else {
      const { error: insErr } = await supabase.from('action_items').insert({
        meeting_id,
        item: row.item,
        pic_user_id: row.pic_user_id,
        due_date: row.due_date,
      });
      if (insErr) return { error: insErr.message };
    }
  }

  return { error: null };
}

export async function createMeetingAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const parsed = readForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { data: created, error } = await supabase
    .from('meetings')
    .insert(parsed.value.meeting)
    .select('meeting_id')
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? 'Failed to create meeting.' };

  const meeting_id = created.meeting_id as string;

  const attErr = await syncAttendees(supabase, meeting_id, parsed.value.attendee_user_ids);
  if (attErr.error) return { ok: false, error: attErr.error };

  const aiErr = await syncActionItems(supabase, meeting_id, parsed.value.action_items);
  if (aiErr.error) return { ok: false, error: aiErr.error };

  revalidatePath('/meetings');
  revalidatePath('/dashboard');
  revalidatePath('/todos');
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

  const parsed = readForm(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { error } = await supabase
    .from('meetings')
    .update(parsed.value.meeting)
    .eq('meeting_id', meeting_id);
  if (error) return { ok: false, error: error.message };

  const attErr = await syncAttendees(supabase, meeting_id, parsed.value.attendee_user_ids);
  if (attErr.error) return { ok: false, error: attErr.error };

  const aiErr = await syncActionItems(supabase, meeting_id, parsed.value.action_items);
  if (aiErr.error) return { ok: false, error: aiErr.error };

  revalidatePath('/meetings');
  revalidatePath(`/meetings/${meeting_id}`);
  revalidatePath('/dashboard');
  revalidatePath('/todos');
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
  revalidatePath('/todos');
  return { ok: true, error: null };
}

export async function toggleActionItemAction(
  action_item_id: string,
  next_status: ActionItemStatus,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!action_item_id) return { ok: false, error: 'Missing action item id.' };
  if (next_status !== 'open' && next_status !== 'done') {
    return { ok: false, error: 'Invalid status.' };
  }

  const { error } = await supabase
    .from('action_items')
    .update({
      status: next_status,
      completed_at: next_status === 'done' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('action_item_id', action_item_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/todos');
  revalidatePath('/meetings');
  return { ok: true, error: null };
}
