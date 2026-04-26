'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  ServiceTier,
  IpoStatus,
  Industry,
  MarketSegment,
  DeliverableKind,
} from '@/lib/types';
import {
  SERVICE_TIER_CODES as SERVICE_TIERS,
  IPO_STATUS_CODES as IPO_STATUSES,
  INDUSTRY_CODES as INDUSTRIES,
  MARKET_SEGMENT_CODES as MARKET_SEGMENTS,
  CLIENT_IMPORT_HEADERS,
} from '@/lib/client-import';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function seedClientDeliverables(
  supabase: SupabaseClient,
  client_id: string,
  service_tiers: ServiceTier[],
): Promise<void> {
  if (service_tiers.length === 0) return;

  const [templatesRes, existingRes] = await Promise.all([
    supabase
      .from('deliverable_templates')
      .select('template_id, service_tier, kind, label, default_target_count')
      .eq('is_active', true)
      .in('service_tier', service_tiers),
    supabase
      .from('client_deliverables')
      .select('template_id')
      .eq('client_id', client_id)
      .not('template_id', 'is', null),
  ]);

  if (templatesRes.error || !templatesRes.data) return;

  const alreadySeeded = new Set(
    (existingRes.data ?? []).map((r) => r.template_id as string),
  );
  type SeedRow = {
    template_id: string;
    service_tier: ServiceTier;
    kind: DeliverableKind;
    label: string;
    default_target_count: number | null;
  };
  const toInsert = (templatesRes.data as SeedRow[])
    .filter((t) => !alreadySeeded.has(t.template_id))
    .map((t) => ({
      client_id,
      template_id: t.template_id,
      service_tier: t.service_tier,
      kind: t.kind,
      label: t.label,
      target_count: t.kind === 'recurring' ? t.default_target_count : null,
    }));

  if (toInsert.length === 0) return;
  await supabase.from('client_deliverables').insert(toInsert);
}

export type ActionState = { ok: boolean; error: string | null };

type ClientPayload = {
  corporate_name: string;
  ticker_code: string | null;
  industry: Industry | null;
  market_segment: MarketSegment | null;
  financial_year_end: string | null;
  ceo_name: string | null;
  cfo_name: string | null;
  logo_url: string | null;
  service_tier: ServiceTier[];
  ipo_status: IpoStatus | null;
  financial_quarter: string | null;
  internal_controls_audit: boolean;
  advisory_syndicate: unknown;
};

function parseJson(raw: string | undefined | null): { ok: true; value: unknown } | { ok: false; error: string } {
  if (!raw || !raw.trim()) return { ok: true, value: [] };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Invalid JSON.' };
  }
}

function validateFinancialYearEnd(raw: string | null): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: null };
  if (!/^\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, error: 'Financial year end must be in MM-DD format (e.g. 12-31).' };
  }
  const [m, d] = raw.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) {
    return { ok: false, error: 'Financial year end has an invalid month or day.' };
  }
  return { ok: true, value: raw };
}

function readPayload(formData: FormData): { ok: true; value: ClientPayload } | { ok: false; error: string } {
  const corporate_name = formData.get('corporate_name')?.toString().trim();
  const ticker_code = formData.get('ticker_code')?.toString().trim().toUpperCase() || null;
  const industry_raw = formData.get('industry')?.toString();
  const market_raw = formData.get('market_segment')?.toString();
  const fye_raw = formData.get('financial_year_end')?.toString().trim() || null;
  const ceo_name = formData.get('ceo_name')?.toString().trim() || null;
  const cfo_name = formData.get('cfo_name')?.toString().trim() || null;
  const logo_url = formData.get('logo_url')?.toString().trim() || null;
  const service_tiers = formData.getAll('service_tier').map((t) => t.toString());
  const ipo_status_raw = formData.get('ipo_status')?.toString();
  const financial_quarter_raw = formData.get('financial_quarter')?.toString();
  const internal_controls_audit = formData.get('internal_controls_audit') === 'true';
  const advisory_raw = formData.get('advisory_syndicate')?.toString();

  if (!corporate_name) return { ok: false, error: 'Company name is required.' };
  if (service_tiers.length === 0) return { ok: false, error: 'At least one service tier is required.' };

  const validTiers = service_tiers.filter((t): t is ServiceTier => SERVICE_TIERS.includes(t as ServiceTier));
  if (validTiers.length === 0) return { ok: false, error: 'Invalid service tier selected.' };

  const industry =
    industry_raw && INDUSTRIES.includes(industry_raw as Industry) ? (industry_raw as Industry) : null;
  const market_segment =
    market_raw && MARKET_SEGMENTS.includes(market_raw as MarketSegment)
      ? (market_raw as MarketSegment)
      : null;
  const ipo_status =
    ipo_status_raw && IPO_STATUSES.includes(ipo_status_raw as IpoStatus)
      ? (ipo_status_raw as IpoStatus)
      : null;

  const fye = validateFinancialYearEnd(fye_raw);
  if (!fye.ok) return { ok: false, error: fye.error };

  const advisory = parseJson(advisory_raw);
  if (!advisory.ok) return { ok: false, error: `Advisory syndicate JSON: ${advisory.error}` };

  return {
    ok: true,
    value: {
      corporate_name,
      ticker_code,
      industry,
      market_segment,
      financial_year_end: fye.value,
      ceo_name,
      cfo_name,
      logo_url,
      service_tier: validTiers,
      ipo_status,
      financial_quarter: financial_quarter_raw || null,
      internal_controls_audit,
      advisory_syndicate: advisory.value,
    },
  };
}

export async function createClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { data: created, error } = await supabase
    .from('clients')
    .insert(payload.value)
    .select('client_id')
    .single();
  if (error || !created) return { ok: false, error: error?.message ?? 'Failed to create client.' };

  await seedClientDeliverables(supabase, created.client_id as string, payload.value.service_tier);

  revalidatePath('/clients');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateClientAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('clients').update(payload.value).eq('client_id', client_id);
  if (error) return { ok: false, error: error.message };

  await seedClientDeliverables(supabase, client_id, payload.value.service_tier);

  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath(`/clients/${client_id}`);
  return { ok: true, error: null };
}

export async function deleteClientAction(client_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const { error } = await supabase.from('clients').delete().eq('client_id', client_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/clients');
  revalidatePath('/projects');
  revalidatePath('/meetings');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

// ---- Bulk import from CSV ----

export type ImportRowError = { row: number; message: string };
export type ImportState = {
  ok: boolean;
  error: string | null;
  imported: number;
  skipped: number;
  errors: ImportRowError[];
};

const IMPORT_INITIAL: ImportState = {
  ok: false,
  error: null,
  imported: 0,
  skipped: 0,
  errors: [],
};

function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM if present.
  const cleaned = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let current: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { current.push(field); field = ''; }
      else if (ch === '\n') { current.push(field); rows.push(current); current = []; field = ''; }
      else field += ch;
    }
  }
  if (field !== '' || current.length) {
    current.push(field);
    rows.push(current);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === 'y' || v === '1';
}

function buildImportPayload(
  record: Record<string, string>,
): { ok: true; value: ClientPayload } | { ok: false; error: string } {
  const corporate_name = record.corporate_name?.trim();
  if (!corporate_name) return { ok: false, error: 'corporate_name is required.' };

  const serviceRaw = (record.service_tier ?? '').trim();
  if (!serviceRaw) return { ok: false, error: 'service_tier is required (semicolon-separated codes).' };
  const tierTokens = serviceRaw.split(/[;,|]/).map((t) => t.trim()).filter(Boolean);
  const validTiers = tierTokens.filter((t): t is ServiceTier =>
    SERVICE_TIERS.includes(t as ServiceTier),
  );
  if (validTiers.length === 0) {
    return { ok: false, error: `service_tier has no valid codes (got "${serviceRaw}").` };
  }
  const invalidTiers = tierTokens.filter((t) => !SERVICE_TIERS.includes(t as ServiceTier));
  if (invalidTiers.length > 0) {
    return { ok: false, error: `Unknown service_tier code(s): ${invalidTiers.join(', ')}.` };
  }

  const industry_raw = record.industry?.trim();
  if (industry_raw && !INDUSTRIES.includes(industry_raw as Industry)) {
    return { ok: false, error: `Unknown industry "${industry_raw}".` };
  }
  const market_raw = record.market_segment?.trim();
  if (market_raw && !MARKET_SEGMENTS.includes(market_raw as MarketSegment)) {
    return { ok: false, error: `Unknown market_segment "${market_raw}".` };
  }
  const ipo_raw = record.ipo_status?.trim();
  if (ipo_raw && !IPO_STATUSES.includes(ipo_raw as IpoStatus)) {
    return { ok: false, error: `Unknown ipo_status "${ipo_raw}".` };
  }

  const fye_raw = record.financial_year_end?.trim() || null;
  const fye = validateFinancialYearEnd(fye_raw);
  if (!fye.ok) return { ok: false, error: fye.error };

  return {
    ok: true,
    value: {
      corporate_name,
      ticker_code: record.ticker_code?.trim().toUpperCase() || null,
      industry: (industry_raw as Industry) || null,
      market_segment: (market_raw as MarketSegment) || null,
      financial_year_end: fye.value,
      ceo_name: record.ceo_name?.trim() || null,
      cfo_name: record.cfo_name?.trim() || null,
      logo_url: null,
      service_tier: validTiers,
      ipo_status: (ipo_raw as IpoStatus) || null,
      financial_quarter: record.financial_quarter?.trim() || null,
      internal_controls_audit: parseBoolean(record.internal_controls_audit),
      advisory_syndicate: [],
    },
  };
}

export async function importClientsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...IMPORT_INITIAL, error: 'You must be signed in.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ...IMPORT_INITIAL, error: 'Please choose a CSV file to import.' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ...IMPORT_INITIAL, error: 'File is too large. Limit is 2 MB.' };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { ...IMPORT_INITIAL, error: 'The file is empty.' };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  const required = CLIENT_IMPORT_HEADERS;
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      ...IMPORT_INITIAL,
      error: `Missing required column(s): ${missing.join(', ')}. Download a fresh template and re-paste your data.`,
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ...IMPORT_INITIAL, error: 'No data rows found beneath the header row.' };
  }

  const payloads: ClientPayload[] = [];
  const errors: ImportRowError[] = [];

  dataRows.forEach((row, idx) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] ?? '';
    });
    const built = buildImportPayload(record);
    if (built.ok) payloads.push(built.value);
    // CSV row number = idx + 2 (1-based, plus header row)
    else errors.push({ row: idx + 2, message: built.error });
  });

  if (payloads.length === 0) {
    return {
      ok: false,
      error: 'No valid rows to import. Fix the errors below and try again.',
      imported: 0,
      skipped: errors.length,
      errors,
    };
  }

  const { data: insertedClients, error } = await supabase
    .from('clients')
    .insert(payloads)
    .select('client_id, service_tier');
  if (error) {
    return {
      ok: false,
      error: `Database error: ${error.message}`,
      imported: 0,
      skipped: errors.length + payloads.length,
      errors,
    };
  }

  for (const c of insertedClients ?? []) {
    await seedClientDeliverables(
      supabase,
      c.client_id as string,
      (c.service_tier ?? []) as ServiceTier[],
    );
  }

  revalidatePath('/clients');
  revalidatePath('/dashboard');
  return {
    ok: true,
    error: null,
    imported: payloads.length,
    skipped: errors.length,
    errors,
  };
}
