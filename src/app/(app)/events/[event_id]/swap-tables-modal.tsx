'use client';

import { useMemo, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import {
  buildTableRows,
  CAPACITY_TONE_CLASS,
  capacityTone,
} from '@/lib/seating';
import type { EventGuest, EventTable } from '@/lib/types';
import { swapEventTablesAction, type TableSwapMode } from '../actions';

// Bulk re-seat a whole table (or two). This is a host action — happens at
// the event detail page, not the kiosk. The two modes:
//
//   • Move — everyone at "from" shifts to "to". Anyone already at "to"
//            stays put (the two groups merge). Use when the host realises
//            Table 5 should move to a different physical spot, or when
//            consolidating after a no-show wipeout.
//
//   • Swap — Table 5 ↔ Table 7. Both groups exchange places. Use when the
//            host wants to flip the head table with a regular round, or
//            re-balance the room.
//
// Capacity is shown live for the destination so the host can see whether
// they're going to spill before confirming. We warn but never block —
// real-world rooms can always pull in a chair.

type Props = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  guests: EventGuest[];
  tables: EventTable[];
  defaultCapacity: number | null;
};

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';
const inputClass =
  'w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';

export default function SwapTablesModal({
  open,
  onClose,
  eventId,
  guests,
  tables,
  defaultCapacity,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [mode, setMode] = useState<TableSwapMode>('move');
  const [from, setFrom] = useState<string>('');
  const [to, setTo] = useState<string>('');

  const rows = useMemo(
    () => buildTableRows(guests, tables, defaultCapacity),
    [guests, tables, defaultCapacity],
  );
  // Source must have at least one guest — you can't move what isn't there.
  const sourceOptions = rows.filter((r) => r.used > 0);

  const fromRow = from ? rows.find((r) => r.table_number === from) ?? null : null;
  const toRow = to ? rows.find((r) => r.table_number === to) ?? null : null;

  // Predict the capacity after the action so the host can see the spill
  // risk before confirming. Move = to gets all of from, from goes empty.
  // Swap = to gets all of from, from gets all of to (counts trade places).
  const previewToUsed =
    mode === 'move'
      ? (toRow?.used ?? 0) + (fromRow?.used ?? 0)
      : (fromRow?.used ?? 0);
  const previewFromUsed =
    mode === 'move' ? 0 : (toRow?.used ?? 0);

  // Capacity for an unknown / unregistered destination — falls back to
  // the event default. Returns null when nothing is set anywhere, in
  // which case we just hide capacity warnings.
  const toCapacity = toRow?.capacity ?? defaultCapacity;
  const fromCapacity = fromRow?.capacity ?? defaultCapacity;

  function close() {
    setError(null);
    setSuccess(null);
    setMode('move');
    setFrom('');
    setTo('');
    onClose();
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!from || !to) {
      setError('Pick the source and destination tables.');
      return;
    }
    if (from.trim() === to.trim()) {
      setError('Source and destination must be different tables.');
      return;
    }

    startTransition(async () => {
      const res = await swapEventTablesAction(eventId, from, to, mode);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const movedFrom = res.moved_from;
      const movedTo = res.moved_to;
      setSuccess(
        mode === 'move'
          ? `Moved ${movedFrom} guest${movedFrom === 1 ? '' : 's'} from Table ${from} to Table ${to}.`
          : `Swapped ${movedFrom} guest${movedFrom === 1 ? '' : 's'} ↔ ${movedTo} guest${movedTo === 1 ? '' : 's'} between Tables ${from} and ${to}.`,
      );
      // Reset selectors but leave the success banner up so the host can
      // confirm visually before closing.
      setFrom('');
      setTo('');
    });
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Move or swap a table"
      description="Bulk re-seat everyone at one table. Each guest's audit log records the move."
      size="2xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {/* Mode toggle */}
        <div>
          <p className={labelClass}>Action</p>
          <div className="inline-flex w-full rounded-md border border-aegis-gray-200 bg-white p-1 sm:w-auto">
            {(
              [
                {
                  value: 'move',
                  label: 'Move',
                  hint: 'Everyone at A → B. Existing guests at B stay (merge).',
                },
                {
                  value: 'swap',
                  label: 'Swap',
                  hint: "Both groups trade places: A ↔ B.",
                },
              ] as const
            ).map((opt) => {
              const active = mode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setMode(opt.value)}
                  className={[
                    'flex-1 rounded px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors sm:flex-initial',
                    active
                      ? 'bg-aegis-navy text-white'
                      : 'text-aegis-gray hover:bg-aegis-gray-50',
                  ].join(' ')}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 text-[11px] text-aegis-gray-500">
            {mode === 'move'
              ? 'Everyone at the source moves to the destination. Existing guests at the destination stay (merge).'
              : 'The two groups exchange places — source guests go to destination and vice versa.'}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* From */}
          <div>
            <label htmlFor="swap_from" className={labelClass}>
              From
            </label>
            <select
              id="swap_from"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              required
              className={inputClass}
            >
              <option value="" disabled>
                Pick a table…
              </option>
              {sourceOptions.map((r) => (
                <option key={r.table_number} value={r.table_number}>
                  Table {r.table_number}
                  {r.label ? ` · ${r.label}` : ''} ({r.used}
                  {r.capacity != null ? ` / ${r.capacity}` : ''}
                  {' guest'}
                  {r.used === 1 ? '' : 's'})
                </option>
              ))}
            </select>
          </div>

          {/* To */}
          <div>
            <label htmlFor="swap_to" className={labelClass}>
              To
            </label>
            <input
              id="swap_to"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              placeholder="e.g. 7, VIP-A"
              className={inputClass}
              list="swap_to_options"
            />
            <datalist id="swap_to_options">
              {rows
                .filter((r) => r.table_number !== from)
                .map((r) => (
                  <option key={r.table_number} value={r.table_number}>
                    Table {r.table_number}
                    {r.label ? ` · ${r.label}` : ''}
                  </option>
                ))}
            </datalist>
            <p className="mt-1 text-[11px] text-aegis-gray-300">
              Type any table number — even one that doesn&apos;t exist yet.
            </p>
          </div>
        </div>

        {/* Preview ─ only meaningful once both ends are set */}
        {from && to && from !== to && (
          <div className="rounded-lg border border-aegis-gray-100 bg-aegis-gray-50/60 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
              After this action
            </p>
            <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PreviewBlock
                label={`Table ${from}`}
                used={previewFromUsed}
                capacity={fromCapacity}
              />
              <PreviewBlock
                label={`Table ${to}`}
                used={previewToUsed}
                capacity={toCapacity}
              />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            <svg
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-3.75a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V7a.75.75 0 0 1 .75-.75Zm0 7.5a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                clipRule="evenodd"
              />
            </svg>
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            <svg
              className="mt-0.5 h-3.5 w-3.5 shrink-0"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M5 12l5 5 9-11" />
            </svg>
            <span>{success}</span>
          </div>
        )}

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="submit"
            disabled={pending || !from || !to}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {pending
              ? mode === 'move'
                ? 'Moving…'
                : 'Swapping…'
              : mode === 'move'
                ? 'Move guests'
                : 'Swap tables'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PreviewBlock({
  label,
  used,
  capacity,
}: {
  label: string;
  used: number;
  capacity: number | null;
}) {
  const tone = capacityTone(used, capacity);
  return (
    <div className="rounded-md border border-aegis-gray-100 bg-white px-3 py-2">
      <p className="text-xs font-medium text-aegis-navy">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={[
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
            CAPACITY_TONE_CLASS[tone],
          ].join(' ')}
        >
          {used}
          <span className="opacity-60">/</span>
          {capacity ?? '∞'}
          {capacity != null && used > capacity && (
            <span className="ml-1 uppercase tracking-wide">over</span>
          )}
        </span>
      </div>
    </div>
  );
}
