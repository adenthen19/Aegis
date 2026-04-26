'use client';

import {
  DateTimeField,
  MultiCheckboxField,
  NumberField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import {
  ENGAGEMENT_STATUS_LABEL,
  ENGAGEMENT_TYPE_LABEL,
  type Engagement,
  type EngagementStatus,
  type EngagementType,
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

const TYPE_OPTIONS = (Object.keys(ENGAGEMENT_TYPE_LABEL) as EngagementType[]).map(
  (t) => ({ value: t, label: ENGAGEMENT_TYPE_LABEL[t] }),
);

const STATUS_OPTIONS = (
  Object.keys(ENGAGEMENT_STATUS_LABEL) as EngagementStatus[]
).map((s) => ({ value: s, label: ENGAGEMENT_STATUS_LABEL[s] }));

export default function EngagementFormFields({
  initial,
  clientId,
  clientTiers,
}: {
  initial?: Engagement;
  clientId: string;
  clientTiers: ServiceTier[];
}) {
  return (
    <>
      {initial && (
        <input type="hidden" name="engagement_id" value={initial.engagement_id} />
      )}
      <input type="hidden" name="client_id" value={clientId} />

      <TextField
        name="name"
        label="Engagement name"
        required
        placeholder="e.g. 2026 IR Retainer, IPO Q3 2026"
        defaultValue={initial?.name ?? undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          name="engagement_type"
          label="Type"
          required
          defaultValue={initial?.engagement_type ?? 'retainer'}
          options={TYPE_OPTIONS}
        />
        <SelectField
          name="status"
          label="Status"
          required
          defaultValue={initial?.status ?? 'active'}
          options={STATUS_OPTIONS}
          hint="Creating a new active engagement closes any prior active one."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateTimeField
          name="start_date"
          label="Start date"
          required
          type="date"
          defaultValue={initial?.start_date ?? undefined}
        />
        <DateTimeField
          name="end_date"
          label="End date"
          type="date"
          defaultValue={initial?.end_date ?? undefined}
        />
      </div>

      <MultiCheckboxField
        name="service_tier"
        label="Tiers in scope"
        required
        options={TIER_OPTIONS}
        defaultValues={initial?.service_tier ?? clientTiers}
        hint="Adding a tier seeds matching templates. Removing one leaves existing commitments alone."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_120px]">
        <NumberField
          name="contract_value"
          label="Contract value"
          step="0.01"
          min={0}
          defaultValue={
            initial?.contract_value != null ? String(initial.contract_value) : undefined
          }
        />
        <TextField
          name="currency"
          label="Currency"
          placeholder="MYR"
          defaultValue={initial?.currency ?? 'MYR'}
        />
      </div>

      <TextAreaField
        name="billing_terms"
        label="Billing terms"
        rows={2}
        placeholder="e.g. Quarterly in advance, NET 30…"
        defaultValue={initial?.billing_terms ?? undefined}
      />

      <TextAreaField
        name="scope_summary"
        label="Scope summary"
        rows={3}
        placeholder="What we're committing to in this engagement…"
        defaultValue={initial?.scope_summary ?? undefined}
      />

      <TextAreaField
        name="notes"
        label="Internal notes"
        rows={2}
        defaultValue={initial?.notes ?? undefined}
      />
    </>
  );
}
