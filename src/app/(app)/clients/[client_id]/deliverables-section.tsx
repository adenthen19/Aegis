'use client';

import { useState, useTransition } from 'react';
import {
  DELIVERABLE_KIND_LABEL,
  DELIVERABLE_STATUS_LABEL,
  type ClientDeliverable,
  type DeliverableStatus,
  type ScheduleAttendee,
  type DeliverableSchedule,
  type ServiceTier,
} from '@/lib/types';
import {
  bumpDeliverableCountAction,
  deleteClientDeliverableAction,
  setDeliverableNotesAction,
  setDeliverableStatusAction,
} from '../deliverables-actions';
import ScheduleSublist from './schedule-sublist';

type AnalystOption = {
  investor_id: string;
  institution_name: string;
  full_name: string | null;
};

type EnrichedAttendee = ScheduleAttendee & {
  analysts: { full_name: string | null; institution_name: string } | null;
};

type ScheduleRow = DeliverableSchedule & { attendees: EnrichedAttendee[] };

const TIER_LABEL: Record<ServiceTier, string> = {
  ir: 'IR',
  pr: 'PR',
  esg: 'ESG',
  virtual_meeting: 'Virtual Meeting',
  ipo: 'IPO',
  agm_egm: 'AGM/EGM',
  social_media: 'Social Media',
  event_management: 'Event Management',
};

const STATUS_OPTIONS: DeliverableStatus[] = [
  'pending',
  'in_progress',
  'completed',
  'not_applicable',
];

const STATUS_BADGE: Record<DeliverableStatus, string> = {
  pending: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
  in_progress: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  not_applicable: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200',
};

export default function DeliverablesSection({
  rows,
  schedulesByDeliverable,
  analysts,
}: {
  rows: ClientDeliverable[];
  schedulesByDeliverable: Record<string, ScheduleRow[]>;
  analysts: AnalystOption[];
}) {
  if (rows.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
        No commitments yet. Set the client&rsquo;s service tier(s) — matching templates seed automatically.
      </p>
    );
  }

  // Within a tier: dated rows first (soonest due first), then undated rows.
  // Inside each bucket, fall back to created_at ascending so display order is
  // deterministic.
  function compareDeliverables(
    a: ClientDeliverable,
    b: ClientDeliverable,
  ): number {
    const ad = a.due_date ? a.due_date : null;
    const bd = b.due_date ? b.due_date : null;
    if (ad && bd) return ad.localeCompare(bd);
    if (ad) return -1;
    if (bd) return 1;
    return (a.created_at ?? '').localeCompare(b.created_at ?? '');
  }

  const grouped = new Map<ServiceTier, ClientDeliverable[]>();
  for (const r of rows) {
    const list = grouped.get(r.service_tier) ?? [];
    list.push(r);
    grouped.set(r.service_tier, list);
  }
  for (const list of grouped.values()) list.sort(compareDeliverables);

  return (
    <div className="space-y-5">
      {Array.from(grouped.entries()).map(([tier, list]) => (
        <div key={tier}>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
            {TIER_LABEL[tier]}
          </p>
          <ul className="divide-y divide-aegis-gray-100 rounded-md border border-aegis-gray-100">
            {list.map((row) => (
              <DeliverableRow
                key={row.client_deliverable_id}
                row={row}
                schedules={schedulesByDeliverable[row.client_deliverable_id] ?? []}
                analysts={analysts}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function DeliverableRow({
  row,
  schedules,
  analysts,
}: {
  row: ClientDeliverable;
  schedules: ScheduleRow[];
  analysts: AnalystOption[];
}) {
  const [pending, startTransition] = useTransition();
  const [notesOpen, setNotesOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [notes, setNotes] = useState(row.notes ?? '');
  const [savedNotes, setSavedNotes] = useState(row.notes ?? '');
  const [error, setError] = useState<string | null>(null);

  const supportsSchedule = row.kind === 'recurring' || row.kind === 'one_off';

  const isRecurring = row.kind === 'recurring';
  const target = row.target_count ?? null;
  const completed = row.completed_count;
  const progress =
    isRecurring && target && target > 0
      ? Math.min(1, completed / target)
      : null;

  function withAction(fn: () => Promise<{ ok: boolean; error: string | null }>) {
    startTransition(async () => {
      setError(null);
      const result = await fn();
      if (!result.ok) setError(result.error);
    });
  }

  function onChangeStatus(next: DeliverableStatus) {
    withAction(() => setDeliverableStatusAction(row.client_deliverable_id, next));
  }

  function onBump(delta: 1 | -1) {
    withAction(() => bumpDeliverableCountAction(row.client_deliverable_id, delta));
  }

  function onSaveNotes() {
    withAction(async () => {
      const result = await setDeliverableNotesAction(row.client_deliverable_id, notes);
      if (result.ok) {
        setSavedNotes(notes);
        setNotesOpen(false);
      }
      return result;
    });
  }

  function onDelete() {
    if (!confirm('Remove this commitment from the client?')) return;
    withAction(() => deleteClientDeliverableAction(row.client_deliverable_id));
  }

  return (
    <li className="px-3 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={[
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                STATUS_BADGE[row.status],
              ].join(' ')}
            >
              {DELIVERABLE_STATUS_LABEL[row.status]}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
              {DELIVERABLE_KIND_LABEL[row.kind]}
            </span>
            {row.auto_generated_key?.startsWith('bursa:') && (
              <span className="inline-flex items-center rounded-full bg-aegis-orange-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aegis-orange-600 ring-1 ring-inset ring-aegis-orange/30">
                Bursa
              </span>
            )}
            {(() => {
              if (!row.due_date) return null;
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const due = new Date(row.due_date);
              const isOpen =
                row.status !== 'completed' && row.status !== 'not_applicable';
              const isOverdue = isOpen && due < today;
              return (
                <span
                  className={[
                    'text-[11px] tabular-nums',
                    isOverdue
                      ? 'font-medium text-red-600'
                      : 'text-aegis-gray-500',
                  ].join(' ')}
                >
                  {isOverdue ? 'Overdue · ' : 'Due '}
                  {new Date(row.due_date).toLocaleDateString(undefined, {
                    dateStyle: 'medium',
                  })}
                </span>
              );
            })()}
          </div>
          <p className="mt-1 text-sm text-aegis-gray">{row.label}</p>
          {isRecurring && target != null && (
            <div className="mt-2 flex items-center gap-2">
              {schedules.length === 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => onBump(-1)}
                    disabled={pending || completed <= 0}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-aegis-gray-200 text-aegis-gray-500 hover:border-aegis-navy hover:text-aegis-navy disabled:opacity-30"
                    aria-label="Decrease"
                    title="Manual count — switch to Schedule for date/attendee tracking"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    onClick={() => onBump(1)}
                    disabled={pending}
                    className="inline-flex h-6 w-6 items-center justify-center rounded border border-aegis-gray-200 text-aegis-gray-500 hover:border-aegis-navy hover:text-aegis-navy disabled:opacity-50"
                    aria-label="Increase"
                    title="Manual count — switch to Schedule for date/attendee tracking"
                  >
                    +
                  </button>
                </>
              )}
              <span className="tabular-nums text-xs text-aegis-gray">
                {completed} / {target}
              </span>
              {progress != null && (
                <div className="ml-1 h-1.5 w-24 overflow-hidden rounded-full bg-aegis-gray-100">
                  <div
                    className="h-full bg-aegis-navy"
                    style={{ width: `${Math.round(progress * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {savedNotes && !notesOpen && (
            <p className="mt-1.5 whitespace-pre-wrap text-[11px] text-aegis-gray-500">
              {savedNotes}
            </p>
          )}
          {notesOpen && (
            <div className="mt-2 space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Notes…"
                className="w-full rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1.5 text-xs text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onSaveNotes}
                  disabled={pending}
                  className="rounded-md bg-aegis-navy px-2.5 py-1 text-[11px] font-medium text-white hover:bg-aegis-navy-700 disabled:opacity-60"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setNotes(savedNotes);
                    setNotesOpen(false);
                  }}
                  disabled={pending}
                  className="rounded-md border border-aegis-gray-200 px-2.5 py-1 text-[11px] text-aegis-gray hover:bg-aegis-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {error && <p className="mt-1.5 text-[11px] text-red-600">{error}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <select
            value={row.status}
            onChange={(e) => onChangeStatus(e.target.value as DeliverableStatus)}
            disabled={pending}
            className="rounded-md border border-aegis-gray-200 bg-white px-2 py-1 text-xs text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {DELIVERABLE_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {supportsSchedule && (
            <button
              type="button"
              onClick={() => setScheduleOpen((v) => !v)}
              className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
            >
              {scheduleOpen ? 'Hide schedule' : `Schedule${schedules.length ? ` (${schedules.length})` : ''}`}
            </button>
          )}
          {!notesOpen && (
            <button
              type="button"
              onClick={() => setNotesOpen(true)}
              className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
            >
              {savedNotes ? 'Edit notes' : 'Add notes'}
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={pending}
            title="Remove commitment"
            aria-label="Remove commitment"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-aegis-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M3 6h18" />
              <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
            </svg>
          </button>
        </div>
      </div>

      {supportsSchedule && scheduleOpen && (
        <ScheduleSublist
          clientDeliverableId={row.client_deliverable_id}
          schedules={schedules}
          analysts={analysts}
        />
      )}
    </li>
  );
}
