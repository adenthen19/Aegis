// Helpers shared between server-side files that work with engagements.
// Not a 'use server' module — these are regular utilities, not server actions.

import type { createClient } from '@/lib/supabase/server';
import type { ServiceTier } from '@/lib/types';

export async function getActiveEngagementForClient(
  supabase: Awaited<ReturnType<typeof createClient>>,
  client_id: string,
): Promise<{ engagement_id: string; service_tier: ServiceTier[] } | null> {
  const { data } = await supabase
    .from('engagements')
    .select('engagement_id, service_tier')
    .eq('client_id', client_id)
    .eq('status', 'active')
    .order('start_date', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return {
    engagement_id: data.engagement_id as string,
    service_tier: (data.service_tier ?? []) as ServiceTier[],
  };
}
