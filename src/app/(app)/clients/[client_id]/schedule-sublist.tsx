'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import {
  DateTimeField,
  FormActions,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import {
  SCHEDULE_STATUS_LABEL,
  type DeliverableSchedule,
  type ScheduleAttendee,
  type ScheduleStatus,
} from '@/lib/types';
import {
  type ActionState,
  addAdhocAttendeeAction,
  addAnalystAttendeeAction,
  createScheduleAction,
  deleteScheduleAction,
  removeAttendeeAction,
  setScheduleStatusAction,
  updateScheduleAction,
} from '../schedule-actions';

type AnalystOption = {
  investor_id: string;
  institution_name: string;
  full_name: string | null;
};

type EnrichedAttendee = ScheduleAttendee & {
  analysts: { full_name: string | null; institution_name: string } | null;
};

type ScheduleRow = DeliverableSchedule & {
  attendees: EnrichedAttendee[];
};

const STATUS_BADGE: Record<ScheduleStatus, string> = {
  planned: 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
  confirmed: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200 line-through',
};

const STATUS_OPTIONS: ScheduleStatus[] = ['planned', 'confirmed', 'completed', 'cancelled'];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function isoToDateTimeLocal(iso: string | undefined | null): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

const initialState: ActionState = { ok: false, error: null };

export default function ScheduleSublist({
  clientDeliverableId,
  schedules,
  analysts,
}: {
  clientDeliverableId: string;
  schedules: ScheduleRow[];
  analysts: AnalystOption[];
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="mt-3 rounded-md border border-aegis-gray-100 bg-aegis-gray-50/40 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-aegis-gray-500">
          Schedule ({schedules.length})
        </p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
        >
          + Add session
        </button>
      </div>

      {schedules.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-aegis-gray-300">
          No sessions planned yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {schedules.map((s) => (
            <ScheduleRowItem key={s.schedule_id} row={s} analysts={analysts} />
          ))}
        </ul>
      )}

      <ScheduleFormModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        clientDeliverableId={clientDeliverableId}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Row + edit + attendees
// ─────────────────────────────────────────────────────────────────────────

function ScheduleRowItem({
  row,
  analysts,
}: {
  row: ScheduleRow;
  analysts: AnalystOption[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [attendeesOpen, setAttendeesOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function withAction(fn: () => Promise<{ ok: boolean; error: string | null }>) {
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
    });
  }

  function onChangeStatus(next: ScheduleStatus) {
    withAction(() => setScheduleStatusAction(row.schedule_id, next));
  }

  function onDelete() {
    if (!confirm('Delete this session?')) return;
    withAction(() => deleteScheduleAction(row.schedule_id));
  }

  return (
    <li className="rounded-md border border-aegis-gray-100 bg-white px-2.5 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium tabular-nums text-aegis-navy">
              {formatDate(row.scheduled_at)}
            </span>
            <span
              className={[
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                STATUS_BADGE[row.status],
              ].join(' ')}
            >
              {SCHEDULE_STATUS_LABEL[row.status]}
            </span>
          </div>
          {row.location && (
            <p className="mt-0.5 text-[11px] text-aegis-gray-500">@ {row.location}</p>
          )}
          {row.notes && (
            <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-aegis-gray-500">
              {row.notes}
            </p>
          )}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setAttendeesOpen((v) => !v)}
              className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
            >
              {row.attendees.length === 0
                ? 'Add attendees'
                : `${attendeesOpen ? 'Hide' : 'Show'} attendees (${row.attendees.length})`}
            </button>
          </div>
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={row.status}
            onChange={(e) => onChangeStatus(e.target.value as ScheduleStatus)}
            disabled={pending}
            className="rounded-md border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {SCHEDULE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            title="Edit session"
            aria-label="Edit session"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-aegis-gray-500 hover:bg-aegis-navy-50 hover:text-aegis-navy"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            title="Delete session"
            aria-label="Delete session"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-aegis-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18" />
              <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
            </svg>
          </button>
        </div>
      </div>

      {attendeesOpen && (
        <AttendeesEditor scheduleId={row.schedule_id} attendees={row.attendees} analysts={analysts} />
      )}

      <ScheduleFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        initial={row}
      />
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Attendees editor
// ─────────────────────────────────────────────────────────────────────────

function AttendeesEditor({
  scheduleId,
  attendees,
  analysts,
}: {
  scheduleId: string;
  attendees: EnrichedAttendee[];
  analysts: AnalystOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [investorId, setInvestorId] = useState('');
  const [analystNote, setAnalystNote] = useState('');
  const [adhocName, setAdhocName] = useState('');
  const [adhocAffiliation, setAdhocAffiliation] = useState('');
  const [adhocNote, setAdhocNote] = useState('');

  const linkedIds = new Set(
    attendees
      .filter((a) => a.investor_id != null)
      .map((a) => a.investor_id as string),
  );
  const availableAnalysts = analysts.filter((a) => !linkedIds.has(a.investor_id));

  function withAction(fn: () => Promise<{ ok: boolean; error: string | null }>) {
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error);
    });
  }

  function onAddAnalyst() {
    if (!investorId) return;
    withAction(async () => {
      const r = await addAnalystAttendeeAction(scheduleId, investorId, analystNote || null);
      if (r.ok) {
        setInvestorId('');
        setAnalystNote('');
      }
      return r;
    });
  }

  function onAddAdhoc() {
    if (!adhocName.trim()) return;
    withAction(async () => {
      const r = await addAdhocAttendeeAction(
        scheduleId,
        adhocName,
        adhocAffiliation || null,
        adhocNote || null,
      );
      if (r.ok) {
        setAdhocName('');
        setAdhocAffiliation('');
        setAdhocNote('');
      }
      return r;
    });
  }

  function onRemove(attendeeId: string) {
    withAction(() => removeAttendeeAction(attendeeId));
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-aegis-gray-100 bg-aegis-gray-50/60 p-2">
      {attendees.length > 0 && (
        <ul className="space-y-1">
          {attendees.map((a) => (
            <li
              key={a.attendee_id}
              className="flex items-start justify-between gap-2 rounded bg-white px-2 py-1"
            >
              <div className="min-w-0">
                {a.investor_id ? (
                  <span className="text-[11px] text-aegis-gray">
                    <span className="font-medium text-aegis-navy">
                      {a.analysts?.full_name || a.analysts?.institution_name || 'Analyst'}
                    </span>
                    {a.analysts?.full_name && a.analysts.institution_name && (
                      <span className="text-aegis-gray-500">
                        {' '}
                        · {a.analysts.institution_name}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-[11px] text-aegis-gray">
                    <span className="font-medium text-aegis-gray">{a.name}</span>
                    {a.affiliation && (
                      <span className="text-aegis-gray-500"> · {a.affiliation}</span>
                    )}
                    <span className="ml-1 text-[10px] uppercase tracking-wide text-aegis-gray-300">
                      ad-hoc
                    </span>
                  </span>
                )}
                {a.note && (
                  <p className="text-[10px] text-aegis-gray-500">{a.note}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(a.attendee_id)}
                disabled={pending}
                className="shrink-0 text-aegis-gray-300 hover:text-red-600 disabled:opacity-50"
                aria-label="Remove attendee"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr_auto]">
        <select
          value={investorId}
          onChange={(e) => setInvestorId(e.target.value)}
          className="rounded border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy"
        >
          <option value="">— Pick analyst —</option>
          {availableAnalysts.map((a) => (
            <option key={a.investor_id} value={a.investor_id}>
              {a.full_name ? `${a.full_name} · ${a.institution_name}` : a.institution_name}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={analystNote}
          onChange={(e) => setAnalystNote(e.target.value)}
          placeholder="Optional note (RSVP, role…)"
          className="rounded border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy"
        />
        <button
          type="button"
          onClick={onAddAnalyst}
          disabled={pending || !investorId}
          className="rounded bg-aegis-navy px-2.5 py-1 text-[11px] font-medium text-white hover:bg-aegis-navy-700 disabled:opacity-60"
        >
          Add analyst
        </button>
      </div>

      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <input
          type="text"
          value={adhocName}
          onChange={(e) => setAdhocName(e.target.value)}
          placeholder="Ad-hoc name"
          className="rounded border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy"
        />
        <input
          type="text"
          value={adhocAffiliation}
          onChange={(e) => setAdhocAffiliation(e.target.value)}
          placeholder="Affiliation (optional)"
          className="rounded border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy"
        />
        <input
          type="text"
          value={adhocNote}
          onChange={(e) => setAdhocNote(e.target.value)}
          placeholder="Note (optional)"
          className="rounded border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy"
        />
        <button
          type="button"
          onClick={onAddAdhoc}
          disabled={pending || !adhocName.trim()}
          className="rounded border border-aegis-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-aegis-navy hover:bg-aegis-navy-50 disabled:opacity-60"
        >
          Add ad-hoc
        </button>
      </div>

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Add / edit session modal
// ─────────────────────────────────────────────────────────────────────────

function ScheduleFormModal({
  open,
  onClose,
  initial,
  clientDeliverableId,
}: {
  open: boolean;
  onClose: () => void;
  initial?: DeliverableSchedule;
  clientDeliverableId?: string;
}) {
  const isEdit = !!initial;
  const [state, action] = useActionState(
    isEdit ? updateScheduleAction : createScheduleAction,
    initialState,
  );

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit session' : 'New session'}
      description={
        isEdit
          ? 'Update date, location, status, or notes.'
          : 'Plan a session for this commitment. Attendees can be added afterwards.'
      }
    >
      <form action={action} className="space-y-4">
        {isEdit ? (
          <input type="hidden" name="schedule_id" value={initial!.schedule_id} />
        ) : (
          <input
            type="hidden"
            name="client_deliverable_id"
            value={clientDeliverableId ?? ''}
          />
        )}

        <DateTimeField
          name="scheduled_at"
          label="Date & time"
          required
          defaultValue={isoToDateTimeLocal(initial?.scheduled_at)}
        />

        <TextField
          name="location"
          label="Location"
          placeholder="e.g. Boardroom A, Zoom link…"
          defaultValue={initial?.location ?? undefined}
        />

        <SelectField
          name="status"
          label="Status"
          required
          defaultValue={initial?.status ?? 'planned'}
          options={STATUS_OPTIONS.map((s) => ({
            value: s,
            label: SCHEDULE_STATUS_LABEL[s],
          }))}
          hint="Marking completed bumps the commitment counter."
        />

        <TextAreaField
          name="notes"
          label="Notes"
          rows={3}
          placeholder="Anything else worth noting…"
          defaultValue={initial?.notes ?? undefined}
        />

        <FormError message={state.error} />
        <FormActions
          onCancel={onClose}
          submitLabel={isEdit ? 'Update' : 'Create'}
        />
      </form>
    </Modal>
  );
}
