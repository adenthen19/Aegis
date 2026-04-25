'use client';

import {
  DateTimeField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import type { Meeting } from '@/lib/types';

function isoToDateTimeLocal(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function MeetingFormFields({
  initial, clients, analysts,
}: {
  initial?: Meeting;
  clients: { client_id: string; corporate_name: string }[];
  analysts: { investor_id: string; institution_name: string }[];
}) {
  return (
    <>
      {initial && <input type="hidden" name="meeting_id" value={initial.meeting_id} />}
      <SelectField
        name="client_id"
        label="Client"
        clearable
        defaultValue={initial?.client_id ?? ''}
        options={clients.map((c) => ({ value: c.client_id, label: c.corporate_name }))}
        hint="Optional, but link at least one of client or investor."
      />
      <SelectField
        name="investor_id"
        label="Investor / fund"
        clearable
        defaultValue={initial?.investor_id ?? ''}
        options={analysts.map((a) => ({ value: a.investor_id, label: a.institution_name }))}
      />
      <SelectField
        name="meeting_format"
        label="Format"
        required
        defaultValue={initial?.meeting_format ?? ''}
        options={[
          { value: 'physical', label: 'Physical' },
          { value: 'online', label: 'Online' },
        ]}
      />
      <DateTimeField
        name="meeting_date"
        label="Date & time"
        required
        defaultValue={isoToDateTimeLocal(initial?.meeting_date)}
      />
      <TextField
        name="attendees"
        label="Attendees"
        placeholder="e.g. Sarah Chen, Mark Patel, John Doe"
        defaultValue={initial?.attendees ?? undefined}
      />
      <TextAreaField
        name="key_takeaways"
        label="Key takeaways"
        placeholder="Summary of discussion, action items, sentiment…"
        rows={4}
        defaultValue={initial?.key_takeaways ?? undefined}
      />
    </>
  );
}
