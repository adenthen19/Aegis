'use client';

import { useState } from 'react';
import {
  DateTimeField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import { EVENT_STATUS_LABEL, type EventRow, type EventStatus } from '@/lib/types';

type ClientOption = { client_id: string; corporate_name: string };

const STATUS_OPTIONS: EventStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];

function isoToDateTimeLocal(iso: string | undefined | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';
const inputClass =
  'w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';

export default function EventFormFields({
  initial,
  clients,
}: {
  initial?: EventRow;
  clients: ClientOption[];
}) {
  const [kind, setKind] = useState<'existing' | 'adhoc'>(
    initial?.adhoc_client_name ? 'adhoc' : 'existing',
  );

  return (
    <>
      <div>
        <span className={labelClass}>Client *</span>
        <div className="mb-2 inline-flex rounded-md border border-aegis-gray-200 bg-white p-1">
          {(['existing', 'adhoc'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={[
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                kind === k
                  ? 'bg-aegis-navy text-white'
                  : 'text-aegis-gray hover:bg-aegis-gray-50',
              ].join(' ')}
            >
              {k === 'existing' ? 'Existing client' : 'Ad-hoc / prospect'}
            </button>
          ))}
        </div>
        <input type="hidden" name="client_kind" value={kind} />

        {kind === 'existing' ? (
          <select
            name="client_id"
            required
            defaultValue={initial?.client_id ?? ''}
            className={inputClass}
          >
            <option value="" disabled>
              Pick a client…
            </option>
            {clients.map((c) => (
              <option key={c.client_id} value={c.client_id}>
                {c.corporate_name}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            name="adhoc_client_name"
            required
            placeholder="e.g. Prospect — Northwind Energy"
            defaultValue={initial?.adhoc_client_name ?? ''}
            className={inputClass}
          />
        )}
        <p className="mt-1 text-[11px] text-aegis-gray-300">
          {kind === 'existing'
            ? 'Picks from your client roster.'
            : 'Free-text — use this for prospects or one-off engagements not yet in the client database.'}
        </p>
      </div>

      <TextField
        name="name"
        label="Event name"
        required
        placeholder="e.g. AGM 2026, Investor Day, Press Briefing"
        defaultValue={initial?.name ?? undefined}
      />

      <DateTimeField
        name="event_date"
        label="Date & time"
        required
        defaultValue={isoToDateTimeLocal(initial?.event_date)}
      />

      <TextField
        name="location"
        label="Location"
        placeholder="e.g. Mandarin Oriental Ballroom, Zoom link…"
        defaultValue={initial?.location ?? undefined}
      />

      <SelectField
        name="status"
        label="Status"
        required
        defaultValue={initial?.status ?? 'planned'}
        options={STATUS_OPTIONS.map((s) => ({
          value: s,
          label: EVENT_STATUS_LABEL[s],
        }))}
      />

      <TextAreaField
        name="description"
        label="Description"
        rows={3}
        placeholder="Agenda, dress code, anything else worth noting…"
        defaultValue={initial?.description ?? undefined}
      />
    </>
  );
}
