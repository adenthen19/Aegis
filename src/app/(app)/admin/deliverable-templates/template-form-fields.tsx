'use client';

import { useState } from 'react';
import {
  CheckboxField,
  NumberField,
  SelectField,
  TextAreaField,
} from '@/components/ui/form';
import {
  DELIVERABLE_KIND_LABEL,
  type DeliverableKind,
  type DeliverableTemplate,
  type ServiceTier,
} from '@/lib/types';

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

const TIER_OPTIONS = (Object.keys(TIER_LABEL) as ServiceTier[]).map((t) => ({
  value: t,
  label: TIER_LABEL[t],
}));

const KIND_OPTIONS = (Object.keys(DELIVERABLE_KIND_LABEL) as DeliverableKind[]).map(
  (k) => ({ value: k, label: DELIVERABLE_KIND_LABEL[k] }),
);

const KIND_HINT: Record<DeliverableKind, string> = {
  one_off: 'Delivered once per engagement (e.g. roadmap document).',
  recurring: 'Delivered N times across the engagement (e.g. 4 analyst meetings).',
  event_triggered: 'Prompted when something else happens (e.g. Q&A pack when a briefing is logged).',
  ongoing: 'Runs throughout the engagement (e.g. strategic consultancy).',
};

export default function TemplateFormFields({
  initial,
}: {
  initial?: DeliverableTemplate;
}) {
  const [kind, setKind] = useState<DeliverableKind>(initial?.kind ?? 'one_off');

  return (
    <>
      {initial && <input type="hidden" name="template_id" value={initial.template_id} />}

      <SelectField
        name="service_tier"
        label="Service tier"
        required
        defaultValue={initial?.service_tier ?? ''}
        options={TIER_OPTIONS}
        hint="Templates are seeded into a client when this tier is selected on the client."
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
        <p className="mt-1 text-[11px] text-aegis-gray-300">{KIND_HINT[kind]}</p>
      </div>

      <TextAreaField
        name="label"
        label="Label"
        required
        defaultValue={initial?.label}
        placeholder="What we commit to deliver…"
        rows={3}
      />

      {kind === 'recurring' && (
        <NumberField
          name="default_target_count"
          label="Default target count"
          required
          min={1}
          defaultValue={
            initial?.default_target_count != null
              ? String(initial.default_target_count)
              : '4'
          }
          hint="How many times we deliver this during a typical engagement."
        />
      )}

      <NumberField
        name="display_order"
        label="Display order"
        defaultValue={String(initial?.display_order ?? 0)}
        hint="Lower numbers show first on the client profile."
      />

      <CheckboxField
        name="is_active"
        label="Active"
        defaultChecked={initial?.is_active ?? true}
        hint="Disable to stop seeding new clients without losing past records."
      />
    </>
  );
}
