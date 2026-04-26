'use server';

import { revalidatePath } from 'next/cache';
import { assertSuperAdmin } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import {
  SERVICE_TIER_CODES as SERVICE_TIERS,
} from '@/lib/client-import';
import type { DeliverableKind, ServiceTier } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const KINDS: DeliverableKind[] = ['one_off', 'recurring', 'event_triggered', 'ongoing'];

type TemplatePayload = {
  service_tier: ServiceTier;
  kind: DeliverableKind;
  label: string;
  default_target_count: number | null;
  display_order: number;
  is_active: boolean;
};

function readPayload(formData: FormData):
  | { ok: true; value: TemplatePayload }
  | { ok: false; error: string } {
  const tier_raw = formData.get('service_tier')?.toString();
  const kind_raw = formData.get('kind')?.toString();
  const label = formData.get('label')?.toString().trim() ?? '';
  const target_raw = formData.get('default_target_count')?.toString().trim() ?? '';
  const order_raw = formData.get('display_order')?.toString().trim() ?? '0';
  const is_active = formData.get('is_active') === 'true';

  if (!tier_raw || !SERVICE_TIERS.includes(tier_raw as ServiceTier)) {
    return { ok: false, error: 'Pick a service tier.' };
  }
  if (!kind_raw || !KINDS.includes(kind_raw as DeliverableKind)) {
    return { ok: false, error: 'Pick a deliverable kind.' };
  }
  if (!label) return { ok: false, error: 'Label is required.' };

  const kind = kind_raw as DeliverableKind;
  let default_target_count: number | null = null;
  if (kind === 'recurring') {
    const n = Number.parseInt(target_raw, 10);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false, error: 'Recurring deliverables need a target count greater than 0.' };
    }
    default_target_count = n;
  } else if (target_raw.length > 0) {
    return {
      ok: false,
      error: 'Only recurring deliverables can have a target count.',
    };
  }

  const display_order = Number.parseInt(order_raw, 10);
  if (!Number.isFinite(display_order)) {
    return { ok: false, error: 'Display order must be a number.' };
  }

  return {
    ok: true,
    value: {
      service_tier: tier_raw as ServiceTier,
      kind,
      label,
      default_target_count,
      display_order,
      is_active,
    },
  };
}

export async function createDeliverableTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase.from('deliverable_templates').insert(parsed.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/deliverable-templates');
  return { ok: true, error: null };
}

export async function updateDeliverableTemplateAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const guard = await assertSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };

  const template_id = formData.get('template_id')?.toString();
  if (!template_id) return { ok: false, error: 'Missing template id.' };

  const parsed = readPayload(formData);
  if (!parsed.ok) return { ok: false, error: parsed.error };

  const supabase = await createClient();
  const { error } = await supabase
    .from('deliverable_templates')
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq('template_id', template_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/deliverable-templates');
  return { ok: true, error: null };
}

export async function deleteDeliverableTemplateAction(
  template_id: string,
): Promise<ActionState> {
  const guard = await assertSuperAdmin();
  if (!guard.ok) return { ok: false, error: guard.error };
  if (!template_id) return { ok: false, error: 'Missing template id.' };

  const supabase = await createClient();
  const { error } = await supabase
    .from('deliverable_templates')
    .delete()
    .eq('template_id', template_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/admin/deliverable-templates');
  return { ok: true, error: null };
}
