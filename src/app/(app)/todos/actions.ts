'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionState = { ok: boolean; error: string | null };

export async function createTodoAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const item = formData.get('item')?.toString().trim();
  if (!item) return { ok: false, error: 'Describe the to-do.' };

  const client_id = formData.get('client_id')?.toString() || null;
  const due_date = formData.get('due_date')?.toString() || null;
  const pic_raw = formData.get('pic_user_id')?.toString() || null;
  const pic_user_id = pic_raw && pic_raw.length > 0 ? pic_raw : user.id;

  const { error } = await supabase.from('action_items').insert({
    item,
    client_id,
    pic_user_id,
    due_date,
    meeting_id: null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath('/todos');
  revalidatePath('/dashboard');
  if (client_id) revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}

export async function reassignTodoAction(
  action_item_id: string,
  next_pic_user_id: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!action_item_id) return { ok: false, error: 'Missing to-do id.' };

  const { data: row } = await supabase
    .from('action_items')
    .select('client_id')
    .eq('action_item_id', action_item_id)
    .maybeSingle();

  const { error } = await supabase
    .from('action_items')
    .update({
      pic_user_id: next_pic_user_id,
      updated_at: new Date().toISOString(),
    })
    .eq('action_item_id', action_item_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/todos');
  revalidatePath('/dashboard');
  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}

export async function deleteTodoAction(action_item_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!action_item_id) return { ok: false, error: 'Missing to-do id.' };

  const { data: row, error: fetchErr } = await supabase
    .from('action_items')
    .select('client_id')
    .eq('action_item_id', action_item_id)
    .maybeSingle();
  if (fetchErr) return { ok: false, error: fetchErr.message };

  const { error } = await supabase
    .from('action_items')
    .delete()
    .eq('action_item_id', action_item_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/todos');
  revalidatePath('/dashboard');
  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}
