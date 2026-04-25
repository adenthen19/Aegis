'use client';

import {
  DateTimeField,
  SelectField,
  TextField,
} from '@/components/ui/form';
import type { Project } from '@/lib/types';

function isoToDateTimeLocal(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  // Strip seconds/ms and convert to "YYYY-MM-DDTHH:MM" in LOCAL time for the input
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function ProjectFormFields({
  initial,
  clients,
}: {
  initial?: Project;
  clients: { client_id: string; corporate_name: string }[];
}) {
  const noClients = clients.length === 0;
  return (
    <>
      {initial && <input type="hidden" name="project_id" value={initial.project_id} />}
      {noClients ? (
        <div className="rounded-md border border-aegis-gold/40 bg-aegis-gold-50 px-3 py-2.5 text-xs text-aegis-gray-700">
          Add a client first — projects must be linked to one.
        </div>
      ) : (
        <SelectField
          name="client_id"
          label="Client"
          required
          defaultValue={initial?.client_id ?? ''}
          options={clients.map((c) => ({ value: c.client_id, label: c.corporate_name }))}
        />
      )}
      <TextField
        name="deliverable_name"
        label="Deliverable name"
        placeholder="e.g. Q1 Earnings call deck"
        required
        defaultValue={initial?.deliverable_name}
      />
      <SelectField
        name="status"
        label="Status"
        required
        defaultValue={initial?.status ?? 'pending'}
        options={[
          { value: 'pending', label: 'Pending' },
          { value: 'upcoming', label: 'Upcoming' },
          { value: 'completed', label: 'Completed' },
        ]}
      />
      <DateTimeField
        name="deadline"
        label="Deadline"
        defaultValue={isoToDateTimeLocal(initial?.deadline)}
      />
    </>
  );
}
