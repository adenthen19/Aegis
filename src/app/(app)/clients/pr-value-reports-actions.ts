'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getActiveEngagementForClient } from './engagements-helpers';

export type ActionState = { ok: boolean; error: string | null };

/**
 * Generate a PR value report for a client over a date range. We sum the
 * coverage rows whose publication_date falls inside [period_start, period_end]
 * and snapshot the totals on the report row at generation time, so the
 * report stays stable even as new coverage rows are added later.
 *
 * Currency: we don't auto-convert. If the team has mixed-currency coverage
 * during the period, the report sums them naively in the report's chosen
 * currency. For a Malaysian IR firm this is almost always MYR; mixed-FX
 * cases need to be normalized in the coverage rows beforehand.
 */
export async function generatePrValueReportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const title = formData.get('title')?.toString().trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const period_start = formData.get('period_start')?.toString();
  const period_end = formData.get('period_end')?.toString();
  if (!period_start || !period_end) {
    return { ok: false, error: 'Period start and end are required.' };
  }
  if (period_end < period_start) {
    return { ok: false, error: 'Period end cannot be before period start.' };
  }

  const currency_raw = formData.get('currency')?.toString().trim().toUpperCase() ?? '';
  const currency = currency_raw.length === 3 ? currency_raw : 'MYR';
  const notes = formData.get('notes')?.toString().trim() || null;

  // Pull the coverage rows in the period to compute totals.
  const { data: coverage, error: coverageErr } = await supabase
    .from('media_coverage')
    .select('reach_estimate, ave_value, prv_value')
    .eq('client_id', client_id)
    .gte('publication_date', period_start)
    .lte('publication_date', period_end);
  if (coverageErr) return { ok: false, error: coverageErr.message };

  const total_coverage_count = coverage?.length ?? 0;
  let total_reach = 0;
  let total_ave = 0;
  let total_prv = 0;
  for (const c of coverage ?? []) {
    total_reach += (c.reach_estimate as number | null) ?? 0;
    total_ave += Number((c.ave_value as number | null) ?? 0);
    total_prv += Number((c.prv_value as number | null) ?? 0);
  }

  const active = await getActiveEngagementForClient(supabase, client_id);

  const { error } = await supabase.from('pr_value_reports').insert({
    client_id,
    engagement_id: active?.engagement_id ?? null,
    title,
    period_start,
    period_end,
    total_coverage_count,
    total_reach,
    total_ave,
    total_prv,
    currency,
    notes,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}

export async function updatePrValueReportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const report_id = formData.get('report_id')?.toString();
  if (!report_id) return { ok: false, error: 'Missing report id.' };

  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const title = formData.get('title')?.toString().trim();
  if (!title) return { ok: false, error: 'Title is required.' };

  const notes = formData.get('notes')?.toString().trim() || null;

  // We don't recompute totals on edit — the snapshot is intentional. To get
  // fresh totals, generate a new report instead.
  const { error } = await supabase
    .from('pr_value_reports')
    .update({ title, notes })
    .eq('report_id', report_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}

export async function markReportSentAction(
  report_id: string,
  email: string | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!report_id) return { ok: false, error: 'Missing report id.' };

  const trimmed = email?.trim() || null;

  const { data: row } = await supabase
    .from('pr_value_reports')
    .select('client_id')
    .eq('report_id', report_id)
    .maybeSingle();

  const { error } = await supabase
    .from('pr_value_reports')
    .update({
      sent_to_client_at: new Date().toISOString(),
      sent_to_email: trimmed,
    })
    .eq('report_id', report_id);
  if (error) return { ok: false, error: error.message };

  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}

export async function clearReportSentAction(
  report_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!report_id) return { ok: false, error: 'Missing report id.' };

  const { data: row } = await supabase
    .from('pr_value_reports')
    .select('client_id')
    .eq('report_id', report_id)
    .maybeSingle();

  const { error } = await supabase
    .from('pr_value_reports')
    .update({ sent_to_client_at: null, sent_to_email: null })
    .eq('report_id', report_id);
  if (error) return { ok: false, error: error.message };

  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}

export async function deletePrValueReportAction(
  report_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!report_id) return { ok: false, error: 'Missing report id.' };

  const { data: row } = await supabase
    .from('pr_value_reports')
    .select('client_id')
    .eq('report_id', report_id)
    .maybeSingle();

  const { error } = await supabase
    .from('pr_value_reports')
    .delete()
    .eq('report_id', report_id);
  if (error) return { ok: false, error: error.message };

  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}
