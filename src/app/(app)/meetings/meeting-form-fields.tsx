'use client';

import { useState } from 'react';
import {
  DateTimeField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import type { ActionItem, Meeting, MeetingType, Profile } from '@/lib/types';

const inputClass =
  'w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';
const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';

function isoToDateTimeLocal(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function nowAsDateTimeLocal(): string {
  return isoToDateTimeLocal(new Date().toISOString())!;
}

type ActionItemRow = {
  // existing rows carry their id so the server can update in place; new rows have null
  action_item_id: string | null;
  item: string;
  pic_user_id: string;
  due_date: string;
};

export default function MeetingFormFields({
  initial,
  initialAttendeeIds = [],
  initialActionItems = [],
  clients,
  analysts,
  profiles,
}: {
  initial?: Meeting;
  initialAttendeeIds?: string[];
  initialActionItems?: ActionItem[];
  clients: { client_id: string; corporate_name: string }[];
  analysts: { investor_id: string; institution_name: string }[];
  profiles: Profile[];
}) {
  const [meetingType, setMeetingType] = useState<MeetingType>(initial?.meeting_type ?? 'internal');
  const [attendeeIds, setAttendeeIds] = useState<Set<string>>(new Set(initialAttendeeIds));
  const [agendaItems, setAgendaItems] = useState<string[]>(
    initial?.agenda_items?.length ? initial.agenda_items : [''],
  );
  const [actionItems, setActionItems] = useState<ActionItemRow[]>(
    initialActionItems.length > 0
      ? initialActionItems.map((a) => ({
          action_item_id: a.action_item_id,
          item: a.item,
          pic_user_id: a.pic_user_id ?? '',
          due_date: a.due_date ?? '',
        }))
      : [{ action_item_id: null, item: '', pic_user_id: '', due_date: '' }],
  );

  const profileLabel = (p: Profile) => p.display_name || p.email;
  const sortedProfiles = [...profiles].sort((a, b) =>
    profileLabel(a).localeCompare(profileLabel(b)),
  );

  function toggleAttendee(user_id: string) {
    setAttendeeIds((prev) => {
      const next = new Set(prev);
      if (next.has(user_id)) next.delete(user_id);
      else next.add(user_id);
      return next;
    });
  }

  return (
    <>
      {initial && <input type="hidden" name="meeting_id" value={initial.meeting_id} />}

      {/* Type toggle */}
      <div>
        <label className={labelClass}>Meeting type</label>
        <div className="grid grid-cols-2 gap-2">
          {(['internal', 'briefing'] as const).map((t) => {
            const active = meetingType === t;
            return (
              <button
                type="button"
                key={t}
                onClick={() => setMeetingType(t)}
                className={[
                  'rounded-md border px-3 py-2 text-sm font-medium capitalize transition-colors',
                  active
                    ? 'border-aegis-navy bg-aegis-navy text-white'
                    : 'border-aegis-gray-200 bg-white text-aegis-gray hover:bg-aegis-gray-50',
                ].join(' ')}
              >
                {t === 'internal' ? 'Internal meeting' : 'Client / investor briefing'}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="meeting_type" value={meetingType} />
        <p className="mt-1 text-[11px] text-aegis-gray-300">
          {meetingType === 'internal'
            ? 'Use the agenda + action items template.'
            : 'Paste the Notta summary; link to the client or investor.'}
        </p>
      </div>

      <DateTimeField
        name="meeting_date"
        label="Date & time"
        required
        defaultValue={isoToDateTimeLocal(initial?.meeting_date) ?? nowAsDateTimeLocal()}
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

      <TextField
        name="location"
        label="Location"
        placeholder="e.g. Office boardroom, Zoom link…"
        defaultValue={initial?.location ?? undefined}
      />

      {meetingType === 'briefing' && (
        <>
          <SelectField
            name="client_id"
            label="Client"
            clearable
            defaultValue={initial?.client_id ?? ''}
            options={clients.map((c) => ({ value: c.client_id, label: c.corporate_name }))}
            hint="Link at least a client or an investor."
          />
          <SelectField
            name="investor_id"
            label="Investor / fund"
            clearable
            defaultValue={initial?.investor_id ?? ''}
            options={analysts.map((a) => ({ value: a.investor_id, label: a.institution_name }))}
          />
        </>
      )}

      {/* Attendees as user multi-select */}
      <div>
        <label className={labelClass}>Attendees</label>
        {sortedProfiles.length === 0 ? (
          <p className="text-xs text-aegis-gray-300">No team members yet.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 rounded-md border border-aegis-gray-200 bg-white p-2 sm:grid-cols-2">
            {sortedProfiles.map((p) => {
              const checked = attendeeIds.has(p.user_id);
              return (
                <label key={p.user_id} className="flex items-center gap-2.5 rounded px-2 py-1 hover:bg-aegis-gray-50">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAttendee(p.user_id)}
                    className="h-4 w-4 cursor-pointer rounded border border-aegis-gray-300 text-aegis-navy accent-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
                  />
                  <span className="text-sm text-aegis-gray">{profileLabel(p)}</span>
                  {checked && <input type="hidden" name="attendee_user_id" value={p.user_id} />}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {meetingType === 'internal' && (
        <Repeater
          label="Agenda items"
          rows={agendaItems}
          onChange={setAgendaItems}
          renderRow={(value, onUpdate) => (
            <input
              type="text"
              name="agenda_item"
              value={value}
              onChange={(e) => onUpdate(e.target.value)}
              placeholder="Topic to discuss"
              className={inputClass}
            />
          )}
          newRow={() => ''}
          addLabel="Add agenda item"
        />
      )}

      {meetingType === 'briefing' && (
        <TextAreaField
          name="summary"
          label="Summary (paste from Notta)"
          placeholder="Paste the meeting summary here…"
          rows={8}
          defaultValue={initial?.summary ?? undefined}
        />
      )}

      {/* Action items repeater (both types) */}
      <div>
        <label className={labelClass}>Action items</label>
        <div className="space-y-2">
          {actionItems.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 rounded-md border border-aegis-gray-200 bg-white p-2 sm:grid-cols-[1fr_180px_160px_auto]">
              <input type="hidden" name="action_item_id" value={row.action_item_id ?? ''} />
              <input
                type="text"
                name="action_item_text"
                value={row.item}
                onChange={(e) => updateActionItem(setActionItems, idx, { item: e.target.value })}
                placeholder="What needs to be done"
                className={inputClass}
              />
              <select
                name="action_item_pic"
                value={row.pic_user_id}
                onChange={(e) => updateActionItem(setActionItems, idx, { pic_user_id: e.target.value })}
                className={inputClass}
              >
                <option value="">— PIC —</option>
                {sortedProfiles.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {profileLabel(p)}
                  </option>
                ))}
              </select>
              <input
                type="date"
                name="action_item_due"
                value={row.due_date}
                onChange={(e) => updateActionItem(setActionItems, idx, { due_date: e.target.value })}
                className={inputClass}
                title="Due date (optional)"
              />
              <button
                type="button"
                onClick={() =>
                  setActionItems((prev) =>
                    prev.length === 1
                      ? [{ action_item_id: null, item: '', pic_user_id: '', due_date: '' }]
                      : prev.filter((_, i) => i !== idx),
                  )
                }
                className="inline-flex items-center justify-center rounded-md px-2 text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
                aria-label="Remove action item"
                title="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setActionItems((prev) => [
              ...prev,
              { action_item_id: null, item: '', pic_user_id: '', due_date: '' },
            ])
          }
          className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-aegis-gray-200 px-3 py-1.5 text-xs font-medium text-aegis-gray-500 hover:border-aegis-navy hover:text-aegis-navy"
        >
          + Add action item
        </button>
      </div>

      <TextAreaField
        name="other_remarks"
        label="Other remarks"
        placeholder="Anything else worth noting…"
        rows={3}
        defaultValue={initial?.other_remarks ?? undefined}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Generic repeater (used for agenda items)

function Repeater<T>({
  label,
  rows,
  onChange,
  renderRow,
  newRow,
  addLabel,
}: {
  label: string;
  rows: T[];
  onChange: (next: T[]) => void;
  renderRow: (value: T, onUpdate: (next: T) => void) => React.ReactNode;
  newRow: () => T;
  addLabel: string;
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="space-y-2">
        {rows.map((row, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="flex-1">
              {renderRow(row, (next) => {
                const copy = rows.slice();
                copy[idx] = next;
                onChange(copy);
              })}
            </div>
            <button
              type="button"
              onClick={() =>
                onChange(rows.length === 1 ? [newRow()] : rows.filter((_, i) => i !== idx))
              }
              className="inline-flex items-center justify-center rounded-md px-2 py-1 text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
              aria-label="Remove"
              title="Remove"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onChange([...rows, newRow()])}
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-dashed border-aegis-gray-200 px-3 py-1.5 text-xs font-medium text-aegis-gray-500 hover:border-aegis-navy hover:text-aegis-navy"
      >
        + {addLabel}
      </button>
    </div>
  );
}

function updateActionItem(
  setRows: React.Dispatch<React.SetStateAction<ActionItemRow[]>>,
  index: number,
  patch: Partial<ActionItemRow>,
) {
  setRows((prev) => {
    const copy = prev.slice();
    copy[index] = { ...copy[index], ...patch };
    return copy;
  });
}
