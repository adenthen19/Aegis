'use client';

import {
  CheckboxField,
  DateTimeField,
  MultiCheckboxField,
  SelectField,
  TextField,
} from '@/components/ui/form';
import {
  INDUSTRY_LABEL,
  MARKET_SEGMENT_LABEL,
  type Client,
  type Industry,
  type MarketSegment,
} from '@/lib/types';
import ClientLogoUpload from './client-logo-upload';

export const TIER_OPTIONS = [
  { value: 'ir', label: 'IR' },
  { value: 'pr', label: 'PR' },
  { value: 'esg', label: 'ESG' },
  { value: 'virtual_meeting', label: 'Virtual Meeting' },
  { value: 'ipo', label: 'IPO' },
  { value: 'agm_egm', label: 'AGM/EGM' },
  { value: 'social_media', label: 'Social Media Management' },
  { value: 'event_management', label: 'Event Management' },
] as const;

export const IPO_OPTIONS = [
  { value: 'readiness', label: 'Readiness' },
  { value: 'roadshow', label: 'Roadshow' },
  { value: 'pricing', label: 'Pricing' },
] as const;

export const INDUSTRY_OPTIONS = (Object.entries(INDUSTRY_LABEL) as [Industry, string][])
  .map(([value, label]) => ({ value, label }));

export const MARKET_SEGMENT_OPTIONS = (Object.entries(MARKET_SEGMENT_LABEL) as [MarketSegment, string][])
  .map(([value, label]) => ({ value, label }));

function isoToDateInput(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  return new Date(iso).toISOString().slice(0, 10);
}

export default function ClientFormFields({ initial }: { initial?: Client }) {
  return (
    <>
      {initial && <input type="hidden" name="client_id" value={initial.client_id} />}

      <ClientLogoUpload defaultUrl={initial?.logo_url} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="corporate_name"
          label="Company name"
          placeholder="e.g. Aurora Capital Holdings"
          required
          defaultValue={initial?.corporate_name}
        />
        <TextField
          name="ticker_code"
          label="Ticker code"
          placeholder="e.g. 5347 or AAPL"
          defaultValue={initial?.ticker_code ?? undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          name="industry"
          label="Industry"
          clearable
          defaultValue={initial?.industry ?? ''}
          options={INDUSTRY_OPTIONS}
        />
        <SelectField
          name="market_segment"
          label="Market segment"
          clearable
          defaultValue={initial?.market_segment ?? ''}
          options={MARKET_SEGMENT_OPTIONS}
          hint="Bursa Malaysia listing board."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="financial_year_end"
          label="Financial year end"
          placeholder="MM-DD (e.g. 12-31)"
          defaultValue={initial?.financial_year_end ?? undefined}
          hint="Month and day, e.g. 12-31 for Dec 31."
        />
        <DateTimeField
          name="financial_quarter"
          label="Current financial quarter"
          type="date"
          defaultValue={isoToDateInput(initial?.financial_quarter)}
        />
      </div>

      <MultiCheckboxField
        name="service_tier"
        label="Service tiers"
        required
        options={TIER_OPTIONS}
        defaultValues={initial?.service_tier ?? []}
      />

      <SelectField
        name="ipo_status"
        label="IPO status"
        clearable
        options={IPO_OPTIONS}
        defaultValue={initial?.ipo_status ?? ''}
      />

      <CheckboxField
        name="internal_controls_audit"
        label="Internal controls audit"
        hint="Tick if an audit is currently active or required."
        defaultChecked={initial?.internal_controls_audit ?? false}
      />

      <p className="text-[11px] text-aegis-gray-300">
        CEO, CFO, advisors, and other contacts are now managed under the
        Stakeholders section on the client profile.
      </p>
    </>
  );
}
