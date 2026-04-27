'use client';

import { useState, useTransition } from 'react';
import {
  DateTimeField,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import type { ActionItem, Meeting, MeetingType, Profile } from '@/lib/types';
import { structureMeetingTranscriptAction } from './actions';

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
  const [summary, setSummary] = useState<string>(initial?.summary ?? '');
  const [summaryKey, setSummaryKey] = useState(0);
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
  const [aiOpen, setAiOpen] = useState(false);

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

      <Repeater
        label={meetingType === 'briefing' ? 'Topics covered' : 'Agenda items'}
        rows={agendaItems}
        onChange={setAgendaItems}
        renderRow={(value, onUpdate) => (
          <input
            type="text"
            name="agenda_item"
            value={value}
            onChange={(e) => onUpdate(e.target.value)}
            placeholder={meetingType === 'briefing' ? 'Topic discussed' : 'Topic to discuss'}
            className={inputClass}
          />
        )}
        newRow={() => ''}
        addLabel={meetingType === 'briefing' ? 'Add topic' : 'Add agenda item'}
      />

      {meetingType === 'briefing' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <label className={labelClass}>Summary (paste from Notta)</label>
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-aegis-navy bg-white px-2.5 py-1 text-[11px] font-medium text-aegis-navy hover:bg-aegis-navy hover:text-white"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                <path d="M10 2.5l1.7 4.3 4.3 1.7-4.3 1.7L10 14.5l-1.7-4.3-4.3-1.7 4.3-1.7L10 2.5zm6 9l.85 2.15L19 14.5l-2.15.85L16 17.5l-.85-2.15L13 14.5l2.15-.85L16 11.5z" />
              </svg>
              Structure with AI
            </button>
          </div>
          <textarea
            key={summaryKey}
            name="summary"
            defaultValue={summary}
            placeholder="Paste the meeting summary here, or use 'Structure with AI' to auto-fill from a transcript…"
            rows={8}
            className={`${inputClass} resize-y`}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
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

      {aiOpen && (
        <AiStructureModal
          meetingType={meetingType}
          attendeeIds={Array.from(attendeeIds)}
          onClose={() => setAiOpen(false)}
          onResult={({ summary: s, agenda_items: ai, action_items: items }) => {
            if (s) {
              setSummary(s);
              setSummaryKey((k) => k + 1);
            }
            if (ai.length > 0) setAgendaItems(ai);
            if (items.length > 0) {
              setActionItems(
                items.map((row) => ({
                  action_item_id: null,
                  item: row.item,
                  pic_user_id: row.pic_user_id ?? '',
                  due_date: row.due_date ?? '',
                })),
              );
            }
            setAiOpen(false);
          }}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// AI structuring modal (briefing only). Fires the Gemini-backed server
// action and pipes the result back into the parent's state setters.

function AiStructureModal({
  meetingType,
  attendeeIds,
  onClose,
  onResult,
}: {
  meetingType: MeetingType;
  attendeeIds: string[];
  onClose: () => void;
  onResult: (data: {
    summary: string;
    agenda_items: string[];
    action_items: { item: string; pic_user_id: string | null; due_date: string | null }[];
  }) => void;
}) {
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleStructure() {
    setError(null);
    if (transcript.trim().length < 30) {
      setError('Paste a longer transcript before structuring.');
      return;
    }
    // Read sibling form fields directly from the DOM — they live in the same
    // <form> as the trigger button, just outside this modal.
    const form = document.querySelector('form');
    const meetingDate =
      form?.querySelector<HTMLInputElement>('input[name="meeting_date"]')?.value ?? '';
    const clientId =
      form?.querySelector<HTMLSelectElement>('select[name="client_id"]')?.value ?? '';
    const investorId =
      form?.querySelector<HTMLSelectElement>('select[name="investor_id"]')?.value ?? '';

    const fd = new FormData();
    fd.append('transcript', transcript);
    fd.append('meeting_type', meetingType);
    if (meetingDate) fd.append('meeting_date', meetingDate);
    if (clientId) fd.append('client_id', clientId);
    if (investorId) fd.append('investor_id', investorId);
    for (const id of attendeeIds) fd.append('attendee_user_id', id);

    startTransition(async () => {
      try {
        const result = await structureMeetingTranscriptAction(
          { ok: false, error: null, data: null },
          fd,
        );
        if (!result.ok || !result.data) {
          setError(result.error ?? 'AI structuring failed.');
          return;
        }
        onResult(result.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'AI structuring failed.');
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-aegis-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-aegis-navy">Structure transcript with AI</h3>
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="text-aegis-gray-300 hover:text-aegis-gray-500 disabled:opacity-40"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <p className="text-xs text-aegis-gray-500">
            Paste the raw transcript or notes (Notta export, scribbled minutes, etc.). Gemini
            will extract a summary, agenda topics, and action items, then fill the form.
            Existing form values will be replaced.
          </p>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="Paste transcript here…"
            rows={12}
            className={`${inputClass} resize-y font-mono text-xs`}
            disabled={pending}
          />
          {error && (
            <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
              {error}
            </div>
          )}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-aegis-gray-100 px-5 py-3 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleStructure}
            disabled={pending || transcript.trim().length === 0}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-navy px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-aegis-navy-600 disabled:opacity-60"
          >
            {pending && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            )}
            {pending ? 'Structuring…' : 'Structure with AI'}
          </button>
        </div>
      </div>
    </div>
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
