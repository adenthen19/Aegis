'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { CoverageSentiment, CoverageType } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const TYPES: CoverageType[] = ['online', 'print', 'broadcast', 'social'];
const SENTIMENTS: CoverageSentiment[] = ['positive', 'neutral', 'negative'];

type CoveragePayload = {
  client_id: string;
  press_release_id: string | null;
  media_id: string | null;
  publication_name: string;
  reporter_name: string | null;
  coverage_type: CoverageType;
  publication_date: string;
  headline: string;
  url: string | null;
  reach_estimate: number | null;
  sentiment: CoverageSentiment | null;
  tone_tags: string[];
  ave_value: number | null;
  prv_value: number | null;
  currency: string;
  notes: string | null;
};

function readPayload(formData: FormData):
  | { ok: true; value: CoveragePayload }
  | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const publication_name = formData.get('publication_name')?.toString().trim();
  if (!publication_name) return { ok: false, error: 'Publication is required.' };

  const headline = formData.get('headline')?.toString().trim();
  if (!headline) return { ok: false, error: 'Headline is required.' };

  const type_raw = formData.get('coverage_type')?.toString();
  if (!type_raw || !TYPES.includes(type_raw as CoverageType)) {
    return { ok: false, error: 'Pick a coverage type.' };
  }

  const publication_date = formData.get('publication_date')?.toString();
  if (!publication_date) return { ok: false, error: 'Publication date is required.' };

  const sentiment_raw = formData.get('sentiment')?.toString();
  const sentiment: CoverageSentiment | null =
    sentiment_raw && SENTIMENTS.includes(sentiment_raw as CoverageSentiment)
      ? (sentiment_raw as CoverageSentiment)
      : null;

  function parseNumber(name: string): { ok: true; value: number | null } | { ok: false; error: string } {
    const raw = formData.get(name)?.toString().trim() ?? '';
    if (raw.length === 0) return { ok: true, value: null };
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: `${name} must be a positive number.` };
    }
    return { ok: true, value: n };
  }
  const reach = parseNumber('reach_estimate');
  if (!reach.ok) return { ok: false, error: reach.error };
  const ave = parseNumber('ave_value');
  if (!ave.ok) return { ok: false, error: ave.error };
  const prv = parseNumber('prv_value');
  if (!prv.ok) return { ok: false, error: prv.error };

  const currency_raw = formData.get('currency')?.toString().trim().toUpperCase() ?? '';
  const currency = currency_raw.length === 3 ? currency_raw : 'MYR';

  const tone_tags = formData
    .getAll('tone_tag')
    .map((v) => v.toString().trim())
    .filter((v) => v.length > 0);

  return {
    ok: true,
    value: {
      client_id,
      press_release_id: formData.get('press_release_id')?.toString() || null,
      media_id: formData.get('media_id')?.toString() || null,
      publication_name,
      reporter_name: formData.get('reporter_name')?.toString().trim() || null,
      coverage_type: type_raw as CoverageType,
      publication_date,
      headline,
      url: formData.get('url')?.toString().trim() || null,
      reach_estimate: reach.value,
      sentiment,
      tone_tags,
      ave_value: ave.value,
      prv_value: prv.value,
      currency,
      notes: formData.get('notes')?.toString().trim() || null,
    },
  };
}

export async function createCoverageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { error } = await supabase.from('media_coverage').insert(parsed.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${parsed.value.client_id}`);
  return { ok: true, error: null };
}

export async function updateCoverageAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const coverage_id = formData.get('coverage_id')?.toString();
  if (!coverage_id) return { ok: false, error: 'Missing coverage id.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { error } = await supabase
    .from('media_coverage')
    .update(parsed.value)
    .eq('coverage_id', coverage_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${parsed.value.client_id}`);
  return { ok: true, error: null };
}

export async function deleteCoverageAction(
  coverage_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!coverage_id) return { ok: false, error: 'Missing coverage id.' };

  const { data: row } = await supabase
    .from('media_coverage')
    .select('client_id')
    .eq('coverage_id', coverage_id)
    .maybeSingle();

  const { error } = await supabase
    .from('media_coverage')
    .delete()
    .eq('coverage_id', coverage_id);
  if (error) return { ok: false, error: error.message };

  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}
