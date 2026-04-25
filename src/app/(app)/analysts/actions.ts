'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { AnalystType } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const ANALYST_TYPES: AnalystType[] = ['buy_side', 'sell_side'];

type AnalystPayload = {
  full_name: string | null;
  institution_name: string;
  analyst_type: AnalystType;
  contact_number: string | null;
  email: string | null;
};

function readPayload(formData: FormData): { ok: true; value: AnalystPayload } | { ok: false; error: string } {
  const full_name = formData.get('full_name')?.toString().trim() || null;
  const institution_name = formData.get('institution_name')?.toString().trim();
  const analyst_type = formData.get('analyst_type')?.toString();
  const contact_number = formData.get('contact_number')?.toString().trim() || null;
  const email = formData.get('email')?.toString().trim() || null;

  if (!institution_name) return { ok: false, error: 'Institution name is required.' };
  if (!analyst_type || !ANALYST_TYPES.includes(analyst_type as AnalystType)) {
    return { ok: false, error: 'Analyst type is required.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email address looks invalid.' };
  }

  return {
    ok: true,
    value: {
      full_name,
      institution_name,
      analyst_type: analyst_type as AnalystType,
      contact_number,
      email,
    },
  };
}

export async function createAnalystAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('analysts').insert(payload.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/analysts');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateAnalystAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const investor_id = formData.get('investor_id')?.toString();
  if (!investor_id) return { ok: false, error: 'Missing investor id.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('analysts').update(payload.value).eq('investor_id', investor_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/analysts');
  revalidatePath('/dashboard');
  revalidatePath(`/analysts/${investor_id}`);
  return { ok: true, error: null };
}

export async function deleteAnalystAction(investor_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!investor_id) return { ok: false, error: 'Missing investor id.' };

  const { error } = await supabase.from('analysts').delete().eq('investor_id', investor_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/analysts');
  revalidatePath('/meetings');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}
