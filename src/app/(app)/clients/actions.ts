'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ServiceTier, IpoStatus, Industry, MarketSegment } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const SERVICE_TIERS: ServiceTier[] = [
  'ir', 'pr', 'esg', 'virtual_meeting',
  'ipo', 'agm_egm', 'social_media', 'event_management',
];
const IPO_STATUSES: IpoStatus[] = ['readiness', 'roadshow', 'pricing'];
const INDUSTRIES: Industry[] = [
  'industrial_products_services', 'consumer_products_services', 'construction',
  'energy', 'financial_services', 'health_care', 'plantation', 'property',
  'reit', 'technology', 'telecommunications_media', 'transportation_logistics',
  'utilities', 'spac', 'closed_end_fund', 'private_company', 'other',
];
const MARKET_SEGMENTS: MarketSegment[] = ['main', 'ace', 'leap'];

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

  const { error } = await supabase.from('clients').insert(payload.value);
  if (error) return { ok: false, error: error.message };

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
