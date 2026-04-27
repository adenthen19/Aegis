'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  INDUSTRY_LABEL,
  IPO_STATUS_LABEL,
  MARKET_SEGMENT_LABEL,
  type ServiceTier,
  type IpoStatus,
  type Industry,
  type MarketSegment,
} from '@/lib/types';
import {
  SERVICE_TIER_CODES as SERVICE_TIERS,
  IPO_STATUS_CODES as IPO_STATUSES,
  INDUSTRY_CODES as INDUSTRIES,
  MARKET_SEGMENT_CODES as MARKET_SEGMENTS,
  CLIENT_IMPORT_HEADERS,
} from '@/lib/client-import';
import {
  IMPORT_INITIAL,
  parseCsv,
  type ImportRowError,
  type ImportState,
} from '@/lib/csv';
import { seedDeliverablesForEngagement } from './seeding-helpers';
import {
  seedQuarterlyPreworkTodos,
  seedRegulatoryDeliverables,
} from './regulatory-helpers';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * On client creation we open a default 12-month retainer engagement so
 * commitments have somewhere to live. The user can rename it, change the
 * dates, or split out additional engagements (e.g. a separate IPO scope)
 * from the client profile afterwards.
 */
async function createDefaultEngagement(
  supabase: SupabaseClient,
  client_id: string,
  service_tiers: ServiceTier[],
  fye: string | null,
  pic_user_id: string | null,
  corporate_name: string | null,
): Promise<string | null> {
  if (service_tiers.length === 0) return null;

  const today = new Date();
  const start = today.toISOString().slice(0, 10);
  const oneYearOut = new Date(today);
  oneYearOut.setFullYear(today.getFullYear() + 1);
  const end = oneYearOut.toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from('engagements')
    .insert({
      client_id,
      name: 'Initial engagement',
      engagement_type: 'retainer',
      status: 'active',
      start_date: start,
      end_date: end,
      service_tier: service_tiers,
      currency: 'MYR',
      scope_summary:
        'Auto-generated default engagement. Edit name, dates, contract value, and scope to match the actual contract.',
    })
    .select('engagement_id')
    .single();
  if (error || !data) return null;

  await seedDeliverablesForEngagement(
    supabase,
    data.engagement_id as string,
    client_id,
    service_tiers,
  );

  await seedRegulatoryDeliverables(supabase, {
    engagement_id: data.engagement_id as string,
    client_id,
    fye,
    start_date: start,
    end_date: end,
    service_tiers,
  });

  await seedQuarterlyPreworkTodos(supabase, {
    engagement_id: data.engagement_id as string,
    client_id,
    pic_user_id,
    client_corporate_name: corporate_name,
  });

  return data.engagement_id as string;
}

export type ActionState = { ok: boolean; error: string | null };

type ClientPayload = {
  corporate_name: string;
  ticker_code: string | null;
  industry: Industry | null;
  market_segment: MarketSegment | null;
  financial_year_end: string | null;
  logo_url: string | null;
  service_tier: ServiceTier[];
  ipo_status: IpoStatus | null;
  financial_quarter: string | null;
  internal_controls_audit: boolean;
};

// Manual form + CSV import both go through parseFinancialYearEnd (defined
// below) so they share the same flexible date handling.

function readPayload(formData: FormData): { ok: true; value: ClientPayload } | { ok: false; error: string } {
  const corporate_name = formData.get('corporate_name')?.toString().trim();
  const ticker_code = formData.get('ticker_code')?.toString().trim().toUpperCase() || null;
  const industry_raw = formData.get('industry')?.toString();
  const market_raw = formData.get('market_segment')?.toString();
  const fye_raw = formData.get('financial_year_end')?.toString().trim() || null;
  const logo_url = formData.get('logo_url')?.toString().trim() || null;
  const service_tiers = formData.getAll('service_tier').map((t) => t.toString());
  const ipo_status_raw = formData.get('ipo_status')?.toString();
  const financial_quarter_raw = formData.get('financial_quarter')?.toString();
  const internal_controls_audit = formData.get('internal_controls_audit') === 'true';

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

  const fye = parseFinancialYearEnd(fye_raw);
  if (!fye.ok) return { ok: false, error: fye.error };

  return {
    ok: true,
    value: {
      corporate_name,
      ticker_code,
      industry,
      market_segment,
      financial_year_end: fye.value,
      logo_url,
      service_tier: validTiers,
      ipo_status,
      financial_quarter: financial_quarter_raw || null,
      internal_controls_audit,
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

  await createDefaultEngagement(
    supabase,
    created.client_id as string,
    payload.value.service_tier,
    payload.value.financial_year_end,
    user.id,
    payload.value.corporate_name,
  );

  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/todos');
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

  // We no longer seed deliverables on client tier changes — commitments are
  // now scoped to engagements. To pull in templates for a newly-added tier,
  // edit the engagement and add the tier there.

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

// ImportRowError, ImportState, IMPORT_INITIAL, parseCsv now live in lib/csv.ts
// for reuse across analyst and media imports. Consumers should import the
// types from @/lib/csv directly — re-exporting them here breaks Turbopack
// since 'use server' files are only allowed to export async functions.

function parseBoolean(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === 'true' || v === 'yes' || v === 'y' || v === '1';
}

// ────────────────────────────────────────────────────────────────────────
// Fuzzy enum matching for CSV imports.
//
// Users paste data from Excel that uses the human label form ("Industrial
// Products & Services", "Main Market") while our enum codes use snake_case
// ("industrial_products_services", "main"). normalizeKey collapses both
// shapes to the same canonical string so a single lookup table catches
// either form, in any case.

function normalizeKey(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_') // & / spaces / slashes / hyphens → _
    .replace(/^_+|_+$/g, '');
}

function buildEnumLookup<T extends string>(
  codes: readonly T[],
  labels?: Record<T, string>,
): Map<string, T> {
  const m = new Map<string, T>();
  for (const c of codes) {
    m.set(normalizeKey(c), c);
    if (labels) m.set(normalizeKey(labels[c]), c);
  }
  return m;
}

const INDUSTRY_LOOKUP = buildEnumLookup<Industry>(INDUSTRIES, INDUSTRY_LABEL);
const MARKET_LOOKUP = buildEnumLookup<MarketSegment>(MARKET_SEGMENTS, MARKET_SEGMENT_LABEL);
const IPO_LOOKUP = buildEnumLookup<IpoStatus>(IPO_STATUSES, IPO_STATUS_LABEL);
const TIER_LOOKUP = buildEnumLookup<ServiceTier>(SERVICE_TIERS);

// ────────────────────────────────────────────────────────────────────────
// Flexible financial-year-end parser.
//
// Accepts the common shapes IR firms paste from Excel:
//   • Numeric:        12-31, 31/12, 2025-12-31, 31/12/2025
//   • Named month:    Dec-31, 31-Dec, December 31, 31 Dec 2025
// Output is always canonical MM-DD ("12-31"). Disambiguation: a part > 12
// is the day; named months pin the month directly. Year-like numbers
// (>31) are dropped.

const MONTH_BY_NAME: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

function formatMmDd(month: number, day: number): string {
  return `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseFinancialYearEnd(
  raw: string | null,
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (!raw) return { ok: true, value: null };

  const tokens = raw.trim().split(/[^a-zA-Z0-9]+/).filter(Boolean);
  if (tokens.length < 2) {
    return {
      ok: false,
      error: 'Financial year end must be a date like Dec-31, 12-31, or 2025-12-31.',
    };
  }

  // Walk tokens once: numbers go in `numbers`, a month name pins `monthFromName`.
  let monthFromName: number | null = null;
  const numbers: number[] = [];
  for (const t of tokens) {
    if (/^\d+$/.test(t)) {
      const n = Number.parseInt(t, 10);
      if (Number.isFinite(n)) numbers.push(n);
      continue;
    }
    const m = MONTH_BY_NAME[t.toLowerCase()];
    if (m) monthFromName = m;
  }

  if (monthFromName !== null) {
    // Month is known via name. Day is whichever numeric part is in 1..31.
    const day = numbers.find((n) => n >= 1 && n <= 31);
    if (day == null) {
      return {
        ok: false,
        error: `Financial year end is missing a day (got "${raw}").`,
      };
    }
    return { ok: true, value: formatMmDd(monthFromName, day) };
  }

  // All-numeric fallback.
  if (numbers.length < 2) {
    return {
      ok: false,
      error: 'Financial year end must be a date like Dec-31, 12-31, or 2025-12-31.',
    };
  }
  let candidates = numbers;
  if (numbers.length >= 3) {
    const yearIdx = numbers.findIndex((p) => p > 31);
    candidates = yearIdx !== -1 ? numbers.filter((_, i) => i !== yearIdx) : numbers.slice(0, 2);
  }
  let [month, day] = candidates;
  if (month > 12 && day <= 12) [month, day] = [day, month];
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return {
      ok: false,
      error: `Financial year end has an invalid month or day (got "${raw}").`,
    };
  }
  return { ok: true, value: formatMmDd(month, day) };
}

function buildImportPayload(
  record: Record<string, string>,
): { ok: true; value: ClientPayload } | { ok: false; error: string } {
  const corporate_name = record.corporate_name?.trim();
  if (!corporate_name) return { ok: false, error: 'corporate_name is required.' };

  // Enum-like fields are matched against both their code form
  // ("technology") and their display label form ("Technology" or even
  // "Industrial Products & Services"), case- and punctuation-insensitive.
  // service_tier is optional — leave blank to import without tiers; the
  // auto-engagement step is skipped so the user can set tiers later.

  const serviceRaw = (record.service_tier ?? '').trim();
  let validTiers: ServiceTier[] = [];
  if (serviceRaw) {
    const tierTokens = serviceRaw
      .split(/[;,|]/)
      .map((t) => t.trim())
      .filter(Boolean);
    const resolved: ServiceTier[] = [];
    const unknown: string[] = [];
    for (const t of tierTokens) {
      const code = TIER_LOOKUP.get(normalizeKey(t));
      if (code) resolved.push(code);
      else unknown.push(t);
    }
    if (unknown.length > 0) {
      return { ok: false, error: `Unknown service_tier code(s): ${unknown.join(', ')}.` };
    }
    validTiers = resolved;
  }

  const industry_raw = record.industry?.trim();
  const industry: Industry | null = industry_raw
    ? (INDUSTRY_LOOKUP.get(normalizeKey(industry_raw)) ?? null)
    : null;
  if (industry_raw && !industry) {
    return { ok: false, error: `Unknown industry "${industry_raw}".` };
  }

  const market_raw = record.market_segment?.trim();
  const market_segment: MarketSegment | null = market_raw
    ? (MARKET_LOOKUP.get(normalizeKey(market_raw)) ?? null)
    : null;
  if (market_raw && !market_segment) {
    return { ok: false, error: `Unknown market_segment "${market_raw}".` };
  }

  const ipo_raw = record.ipo_status?.trim();
  const ipo_status: IpoStatus | null = ipo_raw
    ? (IPO_LOOKUP.get(normalizeKey(ipo_raw)) ?? null)
    : null;
  if (ipo_raw && !ipo_status) {
    return { ok: false, error: `Unknown ipo_status "${ipo_raw}".` };
  }

  const fye_raw = record.financial_year_end?.trim() || null;
  const fye = parseFinancialYearEnd(fye_raw);
  if (!fye.ok) return { ok: false, error: fye.error };

  return {
    ok: true,
    value: {
      corporate_name,
      ticker_code: record.ticker_code?.trim().toUpperCase() || null,
      industry,
      market_segment,
      financial_year_end: fye.value,
      logo_url: null,
      service_tier: validTiers,
      ipo_status,
      financial_quarter: record.financial_quarter?.trim() || null,
      internal_controls_audit: parseBoolean(record.internal_controls_audit),
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

  // Pull existing client identifiers up front so the import can skip rows
  // that already exist instead of duplicating them. Match by lowercased
  // corporate_name OR uppercased ticker_code (whichever the new row has).
  const { data: existingClients } = await supabase
    .from('clients')
    .select('corporate_name, ticker_code');
  const existingNames = new Set(
    (existingClients ?? [])
      .map((c) => (c.corporate_name as string | null)?.trim().toLowerCase())
      .filter((s): s is string => !!s),
  );
  const existingTickers = new Set(
    (existingClients ?? [])
      .map((c) => (c.ticker_code as string | null)?.trim().toUpperCase())
      .filter((s): s is string => !!s),
  );

  const payloads: ClientPayload[] = [];
  const errors: ImportRowError[] = [];
  let duplicates = 0;

  dataRows.forEach((row, idx) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] ?? '';
    });
    const built = buildImportPayload(record);
    if (!built.ok) {
      // CSV row number = idx + 2 (1-based, plus header row)
      errors.push({ row: idx + 2, message: built.error });
      return;
    }
    const v = built.value;
    const nameKey = v.corporate_name.trim().toLowerCase();
    const tickerKey = v.ticker_code?.trim().toUpperCase();
    if (existingNames.has(nameKey) || (tickerKey && existingTickers.has(tickerKey))) {
      duplicates += 1;
      return;
    }
    // Reserve the keys so duplicates within the same upload are caught too.
    existingNames.add(nameKey);
    if (tickerKey) existingTickers.add(tickerKey);
    payloads.push(v);
  });

  if (payloads.length === 0) {
    return {
      ok: errors.length === 0,
      error:
        errors.length === 0 && duplicates > 0
          ? null
          : 'No valid rows to import. Fix the errors below and try again.',
      imported: 0,
      skipped: errors.length,
      duplicates,
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
      duplicates,
      errors,
    };
  }

  // Re-fetch the imported clients with FYE + name so we can seed regulatory
  // events and pre-work todos alongside the default engagement.
  //
  // Critically, seeding is BEST-EFFORT here — the client rows are already in
  // the database by this point. If a seeder throws (e.g. a missing migration
  // or a transient DB blip) we log the affected client and continue rather
  // than leaving the user with a generic "server error" page and no idea
  // whether their import succeeded. They can re-run any failed seeding
  // manually from the engagement edit dialog later.
  const seedingErrors: ImportRowError[] = [];
  const insertedIds = (insertedClients ?? []).map((c) => c.client_id as string);
  if (insertedIds.length > 0) {
    const { data: clientsWithFye } = await supabase
      .from('clients')
      .select('client_id, corporate_name, service_tier, financial_year_end')
      .in('client_id', insertedIds);
    let i = 0;
    for (const c of clientsWithFye ?? []) {
      i += 1;
      try {
        await createDefaultEngagement(
          supabase,
          c.client_id as string,
          (c.service_tier ?? []) as ServiceTier[],
          (c.financial_year_end as string | null) ?? null,
          user.id,
          (c.corporate_name as string | null) ?? null,
        );
      } catch (e) {
        seedingErrors.push({
          row: i,
          message: `Imported "${c.corporate_name}" but failed to seed engagement / commitments: ${
            e instanceof Error ? e.message : String(e)
          }`,
        });
      }
    }
  }

  revalidatePath('/clients');
  revalidatePath('/dashboard');
  return {
    ok: true,
    error: null,
    imported: payloads.length,
    skipped: errors.length + seedingErrors.length,
    duplicates,
    errors: [...errors, ...seedingErrors],
  };
}
