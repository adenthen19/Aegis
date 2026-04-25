'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type ActionState = { ok: boolean; error: string | null };

type MediaPayload = {
  full_name: string;
  company_name: string | null;
  state: string | null;
  contact_number: string | null;
  email: string | null;
};

function readPayload(formData: FormData): { ok: true; value: MediaPayload } | { ok: false; error: string } {
  const full_name = formData.get('full_name')?.toString().trim();
  const company_name = formData.get('company_name')?.toString().trim() || null;
  const state = formData.get('state')?.toString().trim() || null;
  const contact_number = formData.get('contact_number')?.toString().trim() || null;
  const email = formData.get('email')?.toString().trim() || null;

  if (!full_name) return { ok: false, error: 'Name is required.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email address looks invalid.' };
  }

  return {
    ok: true,
    value: { full_name, company_name, state, contact_number, email },
  };
}

export async function createMediaContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('media_contacts').insert(payload.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/media');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateMediaContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const media_id = formData.get('media_id')?.toString();
  if (!media_id) return { ok: false, error: 'Missing media id.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('media_contacts').update(payload.value).eq('media_id', media_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/media');
  revalidatePath('/dashboard');
  revalidatePath(`/media/${media_id}`);
  return { ok: true, error: null };
}

export async function deleteMediaContactAction(media_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!media_id) return { ok: false, error: 'Missing media id.' };

  const { error } = await supabase.from('media_contacts').delete().eq('media_id', media_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/media');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}
