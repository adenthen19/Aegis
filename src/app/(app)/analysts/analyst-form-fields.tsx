'use client';

import { SelectField, TextField } from '@/components/ui/form';
import SelectWithOther from '@/components/ui/select-with-other';
import { ANALYST_INSTITUTIONS } from '@/lib/lookups';
import type { Analyst } from '@/lib/types';

const INSTITUTION_OPTIONS = ANALYST_INSTITUTIONS.map((i) => ({ value: i, label: i }));

export default function AnalystFormFields({ initial }: { initial?: Analyst }) {
  return (
    <>
      {initial && <input type="hidden" name="investor_id" value={initial.investor_id} />}
      <TextField
        name="full_name"
        label="Name"
        placeholder="e.g. Mei Lin Wong"
        defaultValue={initial?.full_name ?? undefined}
      />
      <SelectWithOther
        name="institution_name"
        label="Institution"
        required
        options={INSTITUTION_OPTIONS}
        defaultValue={initial?.institution_name ?? ''}
        hint="Choose from the list. Pick Other if the firm isn’t listed."
        otherPlaceholder="Type the institution name"
      />
      <SelectField
        name="analyst_type"
        label="Type"
        required
        defaultValue={initial?.analyst_type ?? ''}
        options={[
          { value: 'buy_side', label: 'Buy-side' },
          { value: 'sell_side', label: 'Sell-side' },
        ]}
      />
      <TextField
        name="contact_number"
        label="Contact number"
        placeholder="e.g. +60 12-345 6789"
        defaultValue={initial?.contact_number ?? undefined}
      />
      <TextField
        name="email"
        label="Email address"
        type="email"
        placeholder="name@example.com"
        defaultValue={initial?.email ?? undefined}
      />
    </>
  );
}
