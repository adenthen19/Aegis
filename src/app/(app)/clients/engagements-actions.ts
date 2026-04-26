'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  EngagementStatus,
  EngagementType,
  ServiceTier,
} from '@/lib/types';
import { SERVICE_TIER_CODES as SERVICE_TIERS } from '@/lib/client-import';
import { seedDeliverablesForEngagement } from './seeding-helpers';

export type ActionState = { ok: boolean; error: string | null };

const ENGAGEMENT_TYPES: EngagementType[] = [
  'retainer',
  'ipo',
  'agm',
  'one_off',
  'crisis',
];

const ENGAGEMENT_STATUSES: EngagementStatus[] = [
  'draft',
  'active',
  'paused',
  'completed',
  'cancelled',
];

type EngagementPayload = {
  client_id: string;
  name: string;
  engagement_type: EngagementType;
  status: EngagementStatus;
  start_date: string;
  end_date: string | null;
  service_tier: ServiceTier[];
  contract_value: number | null;
  currency: string;
  billing_terms: string | null;
  scope_summary: string | null;
  notes: string | null;
};

function readPayload(formData: FormData):
  | { ok: true; value: EngagementPayload }
  | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const name = formData.get('name')?.toString().trim();
  if (!name) return { ok: false, error: 'Engagement name is required.' };

  const type_raw = formData.get('engagement_type')?.toString();
  if (!type_raw || !ENGAGEMENT_TYPES.includes(type_raw as EngagementType)) {
    return { ok: false, error: 'Pick an engagement type.' };
  }

  const status_raw = formData.get('status')?.toString() ?? 'active';
  const status: EngagementStatus = ENGAGEMENT_STATUSES.includes(
    status_raw as EngagementStatus,
  )
    ? (status_raw as EngagementStatus)
    : 'active';

  const start_date = formData.get('start_date')?.toString();
  if (!start_date) return { ok: false, error: 'Start date is required.' };

  const end_date_raw = formData.get('end_date')?.toString();
  const end_date = end_date_raw && end_date_raw.length > 0 ? end_date_raw : null;
  if (end_date && end_date < start_date) {
    return { ok: false, error: 'End date cannot be before start date.' };
  }

  const tiers = formData.getAll('service_tier').map((t) => t.toString());
  const validTiers = tiers.filter((t): t is ServiceTier =>
    SERVICE_TIERS.includes(t as ServiceTier),
  );
  if (validTiers.length === 0) {
    return { ok: false, error: 'Select at least one service tier.' };
  }

  const contract_value_raw = formData.get('contract_value')?.toString().trim() ?? '';
  let contract_value: number | null = null;
  if (contract_value_raw.length > 0) {
    const v = Number.parseFloat(contract_value_raw);
    if (!Number.isFinite(v) || v < 0) {
      return { ok: false, error: 'Contract value must be a positive number.' };
    }
    contract_value = v;
  }

  const currency_raw = formData.get('currency')?.toString().trim().toUpperCase() ?? '';
  const currency = currency_raw.length === 3 ? currency_raw : 'MYR';

  return {
    ok: true,
    value: {
      client_id,
      name,
      engagement_type: type_raw as EngagementType,
      status,
      start_date,
      end_date,
      service_tier: validTiers,
      contract_value,
      currency,
      billing_terms: formData.get('billing_terms')?.toString().trim() || null,
      scope_summary: formData.get('scope_summary')?.toString().trim() || null,
      notes: formData.get('notes')?.toString().trim() || null,
    },
  };
}

export async function createEngagementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  // If creating a new active engagement, complete any prior actives so we
  // don't end up with two competing scoreboards.
  if (parsed.value.status === 'active') {
    await supabase
      .from('engagements')
      .update({ status: 'completed' })
      .eq('client_id', parsed.value.client_id)
      .eq('status', 'active');
  }

  const { data: created, error } = await supabase
    .from('engagements')
    .insert(parsed.value)
    .select('engagement_id')
    .single();
  if (error || !created) {
    return { ok: false, error: error?.message ?? 'Failed to create engagement.' };
  }

  await seedDeliverablesForEngagement(
    supabase,
    created.engagement_id as string,
    parsed.value.client_id,
    parsed.value.service_tier,
  );

  revalidatePath(`/clients/${parsed.value.client_id}`);
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateEngagementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const engagement_id = formData.get('engagement_id')?.toString();
  if (!engagement_id) return { ok: false, error: 'Missing engagement id.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const { error } = await supabase
    .from('engagements')
    .update(parsed.value)
    .eq('engagement_id', engagement_id);
  if (error) return { ok: false, error: error.message };

  // Tier additions on an existing engagement should pull in any newly-matching
  // templates — already-seeded ones are skipped inside the helper.
  await seedDeliverablesForEngagement(
    supabase,
    engagement_id,
    parsed.value.client_id,
    parsed.value.service_tier,
  );

  revalidatePath(`/clients/${parsed.value.client_id}`);
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function deleteEngagementAction(
  engagement_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!engagement_id) return { ok: false, error: 'Missing engagement id.' };

  const { data: row } = await supabase
    .from('engagements')
    .select('client_id')
    .eq('engagement_id', engagement_id)
    .maybeSingle();

  const { error } = await supabase
    .from('engagements')
    .delete()
    .eq('engagement_id', engagement_id);
  if (error) return { ok: false, error: error.message };

  if (row?.client_id) revalidatePath(`/clients/${row.client_id}`);
  return { ok: true, error: null };
}
