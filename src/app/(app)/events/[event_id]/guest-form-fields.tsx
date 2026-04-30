'use client';

import { TextAreaField, TextField } from '@/components/ui/form';
import type { EventGuest } from '@/lib/types';

export default function GuestFormFields({ initial }: { initial?: EventGuest }) {
  return (
    <>
      <TextField
        name="full_name"
        label="Full name"
        required
        placeholder="e.g. Jane Tan"
        defaultValue={initial?.full_name ?? undefined}
      />
      <TextField
        name="title"
        label="Title / designation"
        placeholder="e.g. Chief Investment Officer"
        defaultValue={initial?.title ?? undefined}
      />
      <TextField
        name="company"
        label="Company"
        placeholder="e.g. Aurora Capital"
        defaultValue={initial?.company ?? undefined}
      />
      <TextField
        name="contact_number"
        label="Contact number"
        placeholder="+60 12-345 6789"
        defaultValue={initial?.contact_number ?? undefined}
      />
      <TextField
        name="email"
        label="Email"
        type="email"
        placeholder="name@example.com"
        defaultValue={initial?.email ?? undefined}
      />
      <TextField
        name="table_number"
        label="Table number"
        placeholder='e.g. 5, Table 12, VIP-A'
        defaultValue={initial?.table_number ?? undefined}
        hint="Optional — leave blank if the event doesn't use seating."
      />
      <TextAreaField
        name="notes"
        label="Notes"
        rows={2}
        placeholder="Dietary, seating, RSVP — anything useful on the day."
        defaultValue={initial?.notes ?? undefined}
      />
    </>
  );
}
