'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { calculateCoveragePrValue, scoreCoverageSentiment } from '@/lib/gemini';
import type { CoverageSentiment, CoverageType } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const TYPES: CoverageType[] = ['online', 'print', 'broadcast', 'social'];
const SENTIMENTS: CoverageSentiment[] = ['positive', 'neutral', 'negative'];

const DOCS_BUCKET = 'documents';
const MAX_CLIPPING_BYTES = 25 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'file';
}

/**
 * If the form carried a clipping (uploaded file OR external URL), create a
 * document row attached to the coverage. Returns an error string on failure
 * so the caller can surface it; absence of any clipping input is a no-op.
 *
 * Updates only ADD clippings — they don't replace existing ones, so the
 * audit trail stays intact even if a user re-edits the row to attach a
 * different version.
 */
async function attachClippingIfProvided(
  supabase: Awaited<ReturnType<typeof createClient>>,
  formData: FormData,
  client_id: string,
  coverage_id: string,
  press_release_id: string | null,
): Promise<string | null> {
  const file = formData.get('clipping_file');
  const externalUrl = formData.get('clipping_url')?.toString().trim() ?? '';
  const hasFile = file instanceof File && file.size > 0;
  const hasUrl = externalUrl.length > 0;
  if (!hasFile && !hasUrl) return null;

  // Prefer the uploaded file if both are somehow set.
  if (hasFile) {
    const f = file as File;
    if (f.size > MAX_CLIPPING_BYTES) {
      return 'Clipping file is too large (limit 25 MB).';
    }
    const document_id = crypto.randomUUID();
    const path = `${client_id}/${document_id}/${sanitizeFilename(f.name)}`;
    const { error: upErr } = await supabase.storage
      .from(DOCS_BUCKET)
      .upload(path, f, {
        contentType: f.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) return upErr.message;

    const { error: insErr } = await supabase.from('documents').insert({
      document_id,
      client_id,
      coverage_id,
      press_release_id,
      name: f.name || 'Clipping',
      file_path: path,
      external_url: null,
      mime_type: f.type || null,
      size_bytes: f.size,
      category: 'clipping',
    });
    if (insErr) {
      // Roll back the bytes so we don't leave orphans.
      await supabase.storage.from(DOCS_BUCKET).remove([path]);
      return insErr.message;
    }
    return null;
  }

  // External URL path — light validation, no file handling.
  try {
    const parsed = new URL(externalUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return 'Clipping URL must start with http:// or https://.';
    }
  } catch {
    return 'Clipping URL is not a valid URL.';
  }

  const { error } = await supabase.from('documents').insert({
    client_id,
    coverage_id,
    press_release_id,
    name: 'Clipping link',
    file_path: null,
    external_url: externalUrl,
    category: 'clipping',
  });
  return error?.message ?? null;
}

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

  const { data: created, error } = await supabase
    .from('media_coverage')
    .insert(parsed.value)
    .select('coverage_id')
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Failed to log coverage.' };
  }

  const coverage_id = created.coverage_id as string;

  const clipErr = await attachClippingIfProvided(
    supabase,
    formData,
    parsed.value.client_id,
    coverage_id,
    parsed.value.press_release_id,
  );
  if (clipErr) {
    // Coverage row exists; surface the clipping problem so the user can
    // re-attach without re-typing the whole row.
    revalidatePath(`/clients/${parsed.value.client_id}`);
    return { ok: false, error: `Coverage saved, but clipping failed: ${clipErr}` };
  }

  // Best-effort AI sentiment scoring. Skip if the user already chose a
  // sentiment manually. Failures are swallowed — the row is saved and the
  // user can re-score from the UI later.
  if (parsed.value.sentiment === null) {
    await tryAutoScoreCoverage(supabase, coverage_id, parsed.value);
  }

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

  const clipErr = await attachClippingIfProvided(
    supabase,
    formData,
    parsed.value.client_id,
    coverage_id,
    parsed.value.press_release_id,
  );
  if (clipErr) {
    revalidatePath(`/clients/${parsed.value.client_id}`);
    return { ok: false, error: `Coverage updated, but clipping failed: ${clipErr}` };
  }

  // Auto-score only when the user cleared the sentiment back to null.
  if (parsed.value.sentiment === null) {
    await tryAutoScoreCoverage(supabase, coverage_id, parsed.value);
  }

  revalidatePath(`/clients/${parsed.value.client_id}`);
  return { ok: true, error: null };
}

// ──────────────────────────────────────────────────────────────────────────
// AI sentiment scoring.
//
// `tryAutoScoreCoverage` is best-effort — used inside create/update so a
// rate-limited or misconfigured Gemini key doesn't block the user from
// saving. `scoreCoverageSentimentAction` is the manual rescore the UI calls
// and DOES surface errors to the user.

async function loadCoverageForScoring(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coverage_id: string,
): Promise<
  | { ok: true; value: {
      client_id: string;
      client_name: string;
      publication_name: string;
      headline: string;
      reporter_name: string | null;
      coverage_type: CoverageType;
      url: string | null;
      notes: string | null;
      existing_tone_tags: string[];
    } }
  | { ok: false; error: string }
> {
  type Row = {
    client_id: string;
    publication_name: string;
    headline: string;
    reporter_name: string | null;
    coverage_type: CoverageType;
    url: string | null;
    notes: string | null;
    tone_tags: string[] | null;
    clients: { corporate_name: string } | null;
  };
  const { data, error } = await supabase
    .from('media_coverage')
    .select(
      'client_id, publication_name, headline, reporter_name, coverage_type, url, notes, tone_tags, clients ( corporate_name )',
    )
    .eq('coverage_id', coverage_id)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  const row = data as unknown as Row | null;
  if (!row) return { ok: false, error: 'Coverage row not found.' };
  return {
    ok: true,
    value: {
      client_id: row.client_id,
      client_name: row.clients?.corporate_name ?? 'the client',
      publication_name: row.publication_name,
      headline: row.headline,
      reporter_name: row.reporter_name,
      coverage_type: row.coverage_type,
      url: row.url,
      notes: row.notes,
      existing_tone_tags: row.tone_tags ?? [],
    },
  };
}

async function tryAutoScoreCoverage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  coverage_id: string,
  payload: CoveragePayload,
): Promise<void> {
  try {
    // Need the client name for the prompt — fetch once.
    const { data: clientRow } = await supabase
      .from('clients')
      .select('corporate_name')
      .eq('client_id', payload.client_id)
      .maybeSingle();

    const score = await scoreCoverageSentiment({
      client_name: (clientRow as { corporate_name?: string } | null)?.corporate_name ?? 'the client',
      publication_name: payload.publication_name,
      headline: payload.headline,
      reporter_name: payload.reporter_name,
      coverage_type: payload.coverage_type,
      url: payload.url,
      notes: payload.notes,
    });

    const update: { sentiment: CoverageSentiment; tone_tags?: string[] } = {
      sentiment: score.sentiment,
    };
    // Only set tone_tags if the user didn't already provide some.
    if (payload.tone_tags.length === 0 && score.tone_tags.length > 0) {
      update.tone_tags = score.tone_tags;
    }

    await supabase.from('media_coverage').update(update).eq('coverage_id', coverage_id);
  } catch (err) {
    // Swallow — user already saved, score can be re-run manually.
    console.error('[coverage] auto-score failed:', err);
  }
}

export async function scoreCoverageSentimentAction(
  coverage_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!coverage_id) return { ok: false, error: 'Missing coverage id.' };

  const loaded = await loadCoverageForScoring(supabase, coverage_id);
  if (!loaded.ok) return { ok: false, error: loaded.error };
  const row = loaded.value;

  let score;
  try {
    score = await scoreCoverageSentiment({
      client_name: row.client_name,
      publication_name: row.publication_name,
      headline: row.headline,
      reporter_name: row.reporter_name,
      coverage_type: row.coverage_type,
      url: row.url,
      notes: row.notes,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'AI scoring failed.',
    };
  }

  // Manual rescore overwrites sentiment but never overwrites user-set tags.
  const update: { sentiment: CoverageSentiment; tone_tags?: string[] } = {
    sentiment: score.sentiment,
  };
  if (row.existing_tone_tags.length === 0 && score.tone_tags.length > 0) {
    update.tone_tags = score.tone_tags;
  }

  const { error } = await supabase
    .from('media_coverage')
    .update(update)
    .eq('coverage_id', coverage_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}

// ──────────────────────────────────────────────────────────────────────────
// AI PR-value calculation.
//
// Mirrors the operator's pre-Aegis workflow: paste URL (or upload a PDF) to
// Gemini, ask "what's the PR value?". Here we hand the model whichever
// source we have (URL via URL Context tool, or PDF/image via inlineData) and
// write only the prv_value + currency fields back.

const INLINE_FILE_LIMIT_BYTES = 18 * 1024 * 1024;

export async function calculatePrValueAction(
  coverage_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!coverage_id) return { ok: false, error: 'Missing coverage id.' };

  // Fetch coverage row + client name + the first attached clipping (any).
  type CoverageRow = {
    client_id: string;
    publication_name: string;
    headline: string;
    coverage_type: CoverageType;
    url: string | null;
    sentiment: CoverageSentiment | null;
    currency: string;
    clients: { corporate_name: string } | null;
  };
  const { data: covRaw, error: covErr } = await supabase
    .from('media_coverage')
    .select(
      'client_id, publication_name, headline, coverage_type, url, sentiment, currency, clients ( corporate_name )',
    )
    .eq('coverage_id', coverage_id)
    .maybeSingle();
  if (covErr) return { ok: false, error: covErr.message };
  const coverage = covRaw as unknown as CoverageRow | null;
  if (!coverage) return { ok: false, error: 'Coverage row not found.' };

  type ClippingRow = {
    document_id: string;
    file_path: string | null;
    external_url: string | null;
    mime_type: string | null;
    size_bytes: number | null;
  };
  const { data: clipRaw } = await supabase
    .from('documents')
    .select('document_id, file_path, external_url, mime_type, size_bytes')
    .eq('coverage_id', coverage_id)
    .eq('category', 'clipping')
    .order('created_at', { ascending: false })
    .limit(1);
  const clipping = ((clipRaw ?? []) as ClippingRow[])[0] ?? null;

  // Pick a source. Prefer the article URL on the coverage row, then any
  // external clipping link, then a Storage-hosted file.
  const articleUrl =
    coverage.url ?? clipping?.external_url ?? null;
  const hasInlineFile = clipping?.file_path !== null && clipping?.file_path !== undefined;

  let source: Parameters<typeof calculateCoveragePrValue>[0]['source'] | null = null;

  if (articleUrl) {
    source = { kind: 'url', url: articleUrl };
  } else if (hasInlineFile) {
    if (
      clipping!.size_bytes != null &&
      clipping!.size_bytes > INLINE_FILE_LIMIT_BYTES
    ) {
      return {
        ok: false,
        error: 'Clipping is too large to send to Gemini (limit 18 MB).',
      };
    }
    const { data: blob, error: dlErr } = await supabase.storage
      .from(DOCS_BUCKET)
      .download(clipping!.file_path!);
    if (dlErr || !blob) {
      return { ok: false, error: dlErr?.message ?? 'Failed to fetch clipping.' };
    }
    const buf = Buffer.from(await blob.arrayBuffer());
    if (buf.byteLength > INLINE_FILE_LIMIT_BYTES) {
      return { ok: false, error: 'Clipping is too large to send to Gemini (limit 18 MB).' };
    }
    source = {
      kind: 'inline',
      mimeType: clipping!.mime_type ?? blob.type ?? 'application/octet-stream',
      base64Data: buf.toString('base64'),
    };
  } else {
    return {
      ok: false,
      error: 'Add an article URL or attach a clipping before calculating PR value.',
    };
  }

  let result;
  try {
    result = await calculateCoveragePrValue({
      client_name: coverage.clients?.corporate_name ?? 'the client',
      publication_name: coverage.publication_name,
      headline: coverage.headline,
      coverage_type: coverage.coverage_type,
      sentiment: coverage.sentiment,
      default_currency: coverage.currency || 'MYR',
      source,
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'AI PR-value calculation failed.',
    };
  }

  const { error: updErr } = await supabase
    .from('media_coverage')
    .update({
      prv_value: result.prv_value,
      currency: result.currency,
    })
    .eq('coverage_id', coverage_id);
  if (updErr) return { ok: false, error: updErr.message };

  revalidatePath(`/clients/${coverage.client_id}`);
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
