'use client';

import { useState } from 'react';
import {
  DateTimeField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import {
  PRESS_RELEASE_STATUS_LABEL,
  PRESS_RELEASE_TYPE_LABEL,
  type PressRelease,
  type PressReleaseStatus,
  type PressReleaseType,
} from '@/lib/types';

const TYPE_OPTIONS = (
  Object.keys(PRESS_RELEASE_TYPE_LABEL) as PressReleaseType[]
).map((t) => ({ value: t, label: PRESS_RELEASE_TYPE_LABEL[t] }));

const STATUS_OPTIONS = (
  Object.keys(PRESS_RELEASE_STATUS_LABEL) as PressReleaseStatus[]
).map((s) => ({ value: s, label: PRESS_RELEASE_STATUS_LABEL[s] }));

export default function PressReleaseFormFields({
  initial,
  clientId,
  pressReleaseCommitments,
  mediaContacts,
}: {
  initial?: PressRelease;
  clientId: string;
  pressReleaseCommitments: { client_deliverable_id: string; label: string }[];
  mediaContacts: { media_id: string; full_name: string; company_name: string | null }[];
}) {
  const [mediaIds, setMediaIds] = useState<Set<string>>(
    new Set(initial?.distribution_media_ids ?? []),
  );

  function toggleMedia(id: string) {
    setMediaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      {initial && (
        <input type="hidden" name="press_release_id" value={initial.press_release_id} />
      )}
      <input type="hidden" name="client_id" value={clientId} />

      <TextField
        name="title"
        label="Title"
        required
        placeholder="e.g. Q1 FY2026 Results — Revenue up 18%"
        defaultValue={initial?.title ?? undefined}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SelectField
          name="release_type"
          label="Type"
          required
          defaultValue={initial?.release_type ?? 'ad_hoc'}
          options={TYPE_OPTIONS}
        />
        <SelectField
          name="status"
          label="Status"
          required
          defaultValue={initial?.status ?? 'draft'}
          options={STATUS_OPTIONS}
          hint="Marking distributed bumps the linked commitment counter."
        />
      </div>

      <DateTimeField
        name="release_date"
        label="Release date"
        type="date"
        defaultValue={initial?.release_date ?? undefined}
      />

      {pressReleaseCommitments.length > 0 && (
        <SelectField
          name="client_deliverable_id"
          label="Linked commitment"
          clearable
          defaultValue={initial?.client_deliverable_id ?? ''}
          options={pressReleaseCommitments.map((c) => ({
            value: c.client_deliverable_id,
            label: c.label,
          }))}
          hint="Optional — distributing this release will bump the counter."
        />
      )}

      <TextAreaField
        name="body"
        label="Body"
        rows={8}
        placeholder="The press release content. Formatted file can be attached as a document."
        defaultValue={initial?.body ?? undefined}
      />

      <div>
        <label className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500">
          Distribution list
        </label>
        {mediaContacts.length === 0 ? (
          <p className="text-[11px] text-aegis-gray-300">
            No media contacts on file yet. Add them under Media Contacts to enable structured
            distribution lists.
          </p>
        ) : (
          <div className="grid max-h-48 grid-cols-1 gap-1.5 overflow-y-auto rounded-md border border-aegis-gray-200 bg-white p-2 sm:grid-cols-2">
            {mediaContacts.map((m) => {
              const checked = mediaIds.has(m.media_id);
              return (
                <label
                  key={m.media_id}
                  className="flex items-center gap-2 rounded px-2 py-1 hover:bg-aegis-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMedia(m.media_id)}
                    className="h-4 w-4 cursor-pointer rounded border border-aegis-gray-300 text-aegis-navy accent-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
                  />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-aegis-gray">
                    {m.full_name}
                    {m.company_name && (
                      <span className="text-aegis-gray-500"> · {m.company_name}</span>
                    )}
                  </span>
                  {checked && (
                    <input
                      type="hidden"
                      name="distribution_media_id"
                      value={m.media_id}
                    />
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>

      <TextAreaField
        name="distribution_notes"
        label="Distribution notes"
        rows={2}
        placeholder="Outlets not in the contacts list, embargo notes, etc."
        defaultValue={initial?.distribution_notes ?? undefined}
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
