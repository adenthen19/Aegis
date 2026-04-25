'use client';

import { TextField } from '@/components/ui/form';
import SelectWithOther from '@/components/ui/select-with-other';
import { MALAYSIAN_MEDIA_COMPANIES } from '@/lib/lookups';
import type { MediaContact } from '@/lib/types';

const COMPANY_OPTIONS = MALAYSIAN_MEDIA_COMPANIES.map((c) => ({ value: c, label: c }));

export default function MediaFormFields({ initial }: { initial?: MediaContact }) {
  return (
    <>
      {initial && <input type="hidden" name="media_id" value={initial.media_id} />}
      <TextField
        name="full_name"
        label="Name"
        placeholder="e.g. Tan Wei Lin"
        required
        defaultValue={initial?.full_name}
      />
      <SelectWithOther
        name="company_name"
        label="Company name"
        options={COMPANY_OPTIONS}
        defaultValue={initial?.company_name ?? ''}
        clearable
        hint="Choose from the list. Pick Other if the outlet isn’t listed."
        otherPlaceholder="Type the outlet name"
      />
      <TextField
        name="state"
        label="State"
        placeholder="e.g. Selangor"
        defaultValue={initial?.state ?? undefined}
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
