'use client';

import { useActionState, useEffect, useState } from 'react';
import Modal from '@/components/ui/modal';
import {
  FormActions,
  FormError,
  NumberField,
  SelectField,
  TextAreaField,
} from '@/components/ui/form';
import {
  DELIVERABLE_KIND_LABEL,
  type DeliverableKind,
  type ServiceTier,
} from '@/lib/types';
import {
  addCustomCommitmentAction,
  type ActionState,
} from '../schedule-actions';

const TIER_LABEL: Record<ServiceTier, string> = {
  ir: 'IR',
  pr: 'PR',
  esg: 'ESG',
  virtual_meeting: 'Virtual Meeting',
  ipo: 'IPO',
  agm_egm: 'AGM/EGM',
  social_media: 'Social Media',
  event_management: 'Event Management',
};

const KIND_OPTIONS = (Object.keys(DELIVERABLE_KIND_LABEL) as DeliverableKind[]).map(
  (k) => ({ value: k, label: DELIVERABLE_KIND_LABEL[k] }),
);

const initial: ActionState = { ok: false, error: null };

export default function NewCustomCommitment({
  clientId,
  clientTiers,
}: {
  clientId: string;
  clientTiers: ServiceTier[];
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<DeliverableKind>('one_off');
  const [state, action] = useActionState(addCustomCommitmentAction, initial);

  useEffect(() => {
    if (state.ok) setOpen(false);
  }, [state]);

  const tierOptions = clientTiers.length
    ? clientTiers.map((t) => ({ value: t, label: TIER_LABEL[t] }))
    : (Object.keys(TIER_LABEL) as ServiceTier[]).map((t) => ({
        value: t,
        label: TIER_LABEL[t],
      }));

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
      >
        + Custom commitment
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Custom commitment"
        description="One-off deliverable for this client only — won't affect templates or other clients."
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="client_id" value={clientId} />

          <SelectField
            name="service_tier"
            label="Service tier"
            required
            defaultValue={clientTiers[0] ?? ''}
            options={tierOptions}
          />

          <div>
            <label
              htmlFor="kind"
              className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
            >
              Kind <span className="ml-0.5 text-aegis-orange">*</span>
            </label>
            <select
              id="kind"
              name="kind"
              required
              value={kind}
              onChange={(e) => setKind(e.target.value as DeliverableKind)}
              className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
            >
              {KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <TextAreaField
            name="label"
            label="Label"
            required
            placeholder="What we&rsquo;re committing to deliver…"
            rows={3}
          />

          {kind === 'recurring' && (
            <NumberField
              name="target_count"
              label="Target count"
              required
              min={1}
              defaultValue="3"
              hint="How many times we&rsquo;ll deliver this."
            />
          )}

          <FormError message={state.error} />
          <FormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}
