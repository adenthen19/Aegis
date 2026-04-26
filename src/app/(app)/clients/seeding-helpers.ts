import type { createClient } from '@/lib/supabase/server';
import type { DeliverableKind, ServiceTier } from '@/lib/types';

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Seed `client_deliverables` rows for an engagement based on active templates
 * matching the engagement's service tiers. Skips templates that have already
 * been seeded (by `template_id`) into this client to avoid duplicates if the
 * function is called repeatedly (e.g. on engagement update).
 */
export async function seedDeliverablesForEngagement(
  supabase: SupabaseClient,
  engagement_id: string,
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
      engagement_id,
      template_id: t.template_id,
      service_tier: t.service_tier,
      kind: t.kind,
      label: t.label,
      target_count: t.kind === 'recurring' ? t.default_target_count : null,
    }));

  if (toInsert.length === 0) return;
  await supabase.from('client_deliverables').insert(toInsert);
}
