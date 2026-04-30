'use client';

import { useState } from 'react';
import {
  DateTimeField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import {
  INTERVIEW_FORMAT_LABEL,
  INTERVIEW_STATUS_LABEL,
  type InterviewFormat,
  type InterviewStatus,
  type MediaInterview,
} from '@/lib/types';

const FORMAT_OPTIONS = (
  Object.keys(INTERVIEW_FORMAT_LABEL) as InterviewFormat[]
).map((f) => ({ value: f, label: INTERVIEW_FORMAT_LABEL[f] }));

const STATUS_OPTIONS = (
  Object.keys(INTERVIEW_STATUS_LABEL) as InterviewStatus[]
).map((s) => ({ value: s, label: INTERVIEW_STATUS_LABEL[s] }));

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

export default function MediaInterviewFormFields({
  initial,
  clientId,
  mediaContacts,
  interviewCommitments,
  coverageOptions,
}: {
  initial?: MediaInterview;
  clientId: string;
  mediaContacts: { media_id: string; full_name: string; company_name: string | null }[];
  interviewCommitments: { client_deliverable_id: string; label: string }[];
  coverageOptions: {
    coverage_id: string;
    headline: string;
    publication_date: string;
  }[];
}) {
  // Toggle between picking an existing media contact and free-text outlet so
  // the user gets one input at a time. Default to the side that's pre-filled.
  const [outletKind, setOutletKind] = useState<'contact' | 'adhoc'>(
    initial?.media_id
      ? 'contact'
      : initial?.publication_name
        ? 'adhoc'
        : 'contact',
  );

  return (
    <>
      {initial && (
        <input type="hidden" name="interview_id" value={initial.interview_id} />
      )}
      <input type="hidden" name="client_id" value={clientId} />

      <div>
        <span className={labelClass}>Media outlet *</span>
        <div className="mb-2 inline-flex rounded-md border border-aegis-gray-200 bg-white p-1">
          {(['contact', 'adhoc'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setOutletKind(k)}
              className={[
                'rounded px-3 py-1 text-xs font-medium transition-colors',
                outletKind === k
                  ? 'bg-aegis-navy text-white'
                  : 'text-aegis-gray hover:bg-aegis-gray-50',
              ].join(' ')}
            >
              {k === 'contact' ? 'Pick from media contacts' : 'Ad-hoc / free text'}
            </button>
          ))}
        </div>

        {outletKind === 'contact' ? (
          <>
            <select
              name="media_id"
              defaultValue={initial?.media_id ?? ''}
              className={inputClass}
            >
              <option value="">— Pick a media contact —</option>
              {mediaContacts.map((m) => (
                <option key={m.media_id} value={m.media_id}>
                  {m.company_name ? `${m.full_name} · ${m.company_name}` : m.full_name}
                </option>
              ))}
            </select>
            {/* Empty publication_name when picking a contact — server still
                accepts the row because media_id is set. */}
            <input type="hidden" name="publication_name" value="" />
          </>
        ) : (
          <>
            <input
              type="text"
              name="publication_name"
              required
              placeholder="e.g. The Edge, BFM, Nikkei Asia"
              defaultValue={initial?.publication_name ?? ''}
              className={inputClass}
            />
            <input type="hidden" name="media_id" value="" />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          name="reporter_name"
          label="Reporter"
          placeholder="e.g. John Tan"
          defaultValue={initial?.reporter_name ?? undefined}
        />
        <TextField
          name="spokesperson_name"
          label="Client spokesperson"
          placeholder="e.g. CEO, CFO, Head of IR"
          defaultValue={initial?.spokesperson_name ?? undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <DateTimeField
          name="interview_date"
          label="Interview date & time"
          required
          defaultValue={isoToDateTimeLocal(initial?.interview_date)}
        />
        <SelectField
          name="interview_format"
          label="Format"
          required
          defaultValue={initial?.interview_format ?? 'in_person'}
          options={FORMAT_OPTIONS}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          name="status"
          label="Status"
          required
          defaultValue={initial?.status ?? 'scheduled'}
          options={STATUS_OPTIONS}
          hint="Marking completed bumps the linked commitment counter."
        />
        <DateTimeField
          name="expected_publish_date"
          label="Expected publish date"
          type="date"
          defaultValue={initial?.expected_publish_date ?? undefined}
        />
      </div>

      <TextField
        name="topic"
        label="Topic"
        placeholder="e.g. Q4 results, IPO plans, ESG roadmap"
        defaultValue={initial?.topic ?? undefined}
      />

      {interviewCommitments.length > 0 && (
        <SelectField
          name="client_deliverable_id"
          label="Linked commitment"
          clearable
          defaultValue={initial?.client_deliverable_id ?? ''}
          options={interviewCommitments.map((c) => ({
            value: c.client_deliverable_id,
            label: c.label,
          }))}
          hint="Optional. Marking the interview completed will bump this commitment's counter."
        />
      )}

      {coverageOptions.length > 0 && (
        <SelectField
          name="coverage_id"
          label="Resulting coverage"
          clearable
          defaultValue={initial?.coverage_id ?? ''}
          options={coverageOptions.map((c) => ({
            value: c.coverage_id,
            label: `${new Date(c.publication_date).toLocaleDateString(undefined, {
              dateStyle: 'medium',
            })} — ${c.headline}`,
          }))}
          hint="Optional. Link the published article once it runs."
        />
      )}

      <TextAreaField
        name="notes"
        label="Notes"
        rows={3}
        placeholder="Briefing points, embargo terms, follow-ups…"
        defaultValue={initial?.notes ?? undefined}
      />
    </>
  );
}
