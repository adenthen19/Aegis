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
import {
  seedQuarterlyPreworkTodos,
  seedRegulatoryDeliverables,
} from './regulatory-helpers';

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

  // Pull the client's FYE + corporate name so we can seed Bursa regulatory
  // deliverables and the matching pre-work todos.
  const { data: clientRow } = await supabase
    .from('clients')
    .select('financial_year_end, corporate_name')
    .eq('client_id', parsed.value.client_id)
    .maybeSingle();
  await seedRegulatoryDeliverables(supabase, {
    engagement_id: created.engagement_id as string,
    client_id: parsed.value.client_id,
    fye: (clientRow?.financial_year_end as string | null) ?? null,
    start_date: parsed.value.start_date,
    end_date: parsed.value.end_date,
    service_tiers: parsed.value.service_tier,
  });
  await seedQuarterlyPreworkTodos(supabase, {
    engagement_id: created.engagement_id as string,
    client_id: parsed.value.client_id,
    pic_user_id: user.id,
    client_corporate_name:
      (clientRow?.corporate_name as string | null) ?? null,
  });

  revalidatePath(`/clients/${parsed.value.client_id}`);
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/todos');
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

  // Date changes can pull more fiscal years into scope (e.g. extending the
  // engagement by 6 months). Re-run the regulatory seeder; existing keys are
  // skipped so we don't duplicate or overwrite user edits.
  const { data: clientRow } = await supabase
    .from('clients')
    .select('financial_year_end, corporate_name')
    .eq('client_id', parsed.value.client_id)
    .maybeSingle();
  await seedRegulatoryDeliverables(supabase, {
    engagement_id,
    client_id: parsed.value.client_id,
    fye: (clientRow?.financial_year_end as string | null) ?? null,
    start_date: parsed.value.start_date,
    end_date: parsed.value.end_date,
    service_tiers: parsed.value.service_tier,
  });
  await seedQuarterlyPreworkTodos(supabase, {
    engagement_id,
    client_id: parsed.value.client_id,
    pic_user_id: user.id,
    client_corporate_name:
      (clientRow?.corporate_name as string | null) ?? null,
  });

  revalidatePath(`/clients/${parsed.value.client_id}`);
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/todos');
  return { ok: true, error: null };
}

/**
 * Renew an engagement: close the current one (status → completed) and open
 * a new active engagement covering the next 12 months. The new engagement
 * inherits the original's name (with " — renewed" suffix), engagement_type,
 * service_tier, contract_value, currency, billing_terms, and scope_summary
 * so the user only edits what's actually different on the new contract.
 *
 * The new period starts the day after the source's end_date (or today if
 * the source had no end_date), running 12 months forward. After insertion
 * we run the standard seeders so commitments + regulatory deadlines + the
 * quarterly pre-work todos all materialise on the new engagement.
 */
export async function renewEngagementAction(
  engagement_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!engagement_id) return { ok: false, error: 'Missing engagement id.' };

  const { data: source, error: srcErr } = await supabase
    .from('engagements')
    .select(
      'engagement_id, client_id, name, engagement_type, service_tier, contract_value, currency, billing_terms, scope_summary, end_date',
    )
    .eq('engagement_id', engagement_id)
    .maybeSingle();
  if (srcErr) return { ok: false, error: srcErr.message };
  if (!source) return { ok: false, error: 'Engagement not found.' };

  // Compute the new period. Day-after-end if end_date is set; otherwise today.
  const sourceEnd = source.end_date as string | null;
  const newStart = (() => {
    if (sourceEnd) {
      const d = new Date(`${sourceEnd}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 1);
      return d.toISOString().slice(0, 10);
    }
    return new Date().toISOString().slice(0, 10);
  })();
  const newEnd = (() => {
    const d = new Date(`${newStart}T00:00:00Z`);
    d.setUTCFullYear(d.getUTCFullYear() + 1);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  // Close the prior engagement.
  await supabase
    .from('engagements')
    .update({ status: 'completed' })
    .eq('engagement_id', engagement_id);

  const tiers = (source.service_tier ?? []) as ServiceTier[];

  const { data: created, error: insErr } = await supabase
    .from('engagements')
    .insert({
      client_id: source.client_id as string,
      name: `${source.name as string} — renewed`,
      engagement_type: source.engagement_type as EngagementType,
      status: 'active' as EngagementStatus,
      start_date: newStart,
      end_date: newEnd,
      service_tier: tiers,
      contract_value: source.contract_value,
      currency: source.currency as string,
      billing_terms: source.billing_terms as string | null,
      scope_summary: source.scope_summary as string | null,
    })
    .select('engagement_id')
    .single();
  if (insErr || !created) {
    return { ok: false, error: insErr?.message ?? 'Failed to create renewed engagement.' };
  }

  // Pull FYE + corporate name once so the regulatory + pre-work seeders work.
  const { data: clientRow } = await supabase
    .from('clients')
    .select('financial_year_end, corporate_name')
    .eq('client_id', source.client_id as string)
    .maybeSingle();

  await seedDeliverablesForEngagement(
    supabase,
    created.engagement_id as string,
    source.client_id as string,
    tiers,
  );
  await seedRegulatoryDeliverables(supabase, {
    engagement_id: created.engagement_id as string,
    client_id: source.client_id as string,
    fye: (clientRow?.financial_year_end as string | null) ?? null,
    start_date: newStart,
    end_date: newEnd,
    service_tiers: tiers,
  });
  await seedQuarterlyPreworkTodos(supabase, {
    engagement_id: created.engagement_id as string,
    client_id: source.client_id as string,
    pic_user_id: user.id,
    client_corporate_name:
      (clientRow?.corporate_name as string | null) ?? null,
  });

  revalidatePath(`/clients/${source.client_id as string}`);
  revalidatePath('/clients');
  revalidatePath('/dashboard');
  revalidatePath('/director');
  revalidatePath('/todos');
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
