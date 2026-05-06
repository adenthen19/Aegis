'use client';

import { useMemo, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import TablePicker from '@/components/seating/table-picker';
import { buildTableRows, type TableRow } from '@/lib/seating';
import type { EventGuest, EventTable } from '@/lib/types';
import {
  kioskAddCompanionAction,
  type KioskCompanionMode,
  type KioskCompanionResult,
} from './actions';

// +1 companion: the host's name is on the list, but they brought someone
// who isn't. Three branches, gated by whether the host's current table
// has room:
//
//   Host has room (≥1 free seat at their table):
//     • SAME — companion sits with host. Default focus.
//     • MOVE_BOTH — re-seat the pair somewhere with ≥2 free seats.
//     • SPLIT — companion sits separately.
//
//   Host's table is full:
//     • MOVE_BOTH — destination needs ≥2 free seats. Default focus, the
//                   "polite host" choice.
//     • SPLIT — host stays, companion goes elsewhere.
//     • OVERRIDE — squeeze companion onto host's full table; audited as
//                  a capacity override.
//
// The `same` branch is hidden when the host has no table assigned at all
// — there's nothing to share, so it collapses to walk-in-style picking.

type Props = {
  open: boolean;
  onClose: () => void;
  eventId: string;
  host: EventGuest;
  guests: EventGuest[];
  tables: EventTable[];
  defaultCapacity: number | null;
  onSuccess: (result: Extract<KioskCompanionResult, { ok: true }>) => void;
};

const labelClass =
  'mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500';
const inputClass =
  'w-full rounded-lg border border-aegis-gray-200 bg-white px-3 py-2.5 text-sm text-aegis-gray-900 placeholder:text-aegis-gray-300 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10';

type ModeChoice = {
  mode: KioskCompanionMode;
  label: string;
  description: string;
  recommended: boolean;
  available: boolean;
  disabledReason?: string;
};

function findHostRow(rows: TableRow[], hostTable: string | null): TableRow | null {
  if (!hostTable) return null;
  return rows.find((r) => r.table_number === hostTable) ?? null;
}

export default function CompanionModal({
  open,
  onClose,
  eventId,
  host,
  guests,
  tables,
  defaultCapacity,
  onSuccess,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(`Guest of ${host.full_name}`);
  const [title, setTitle] = useState('');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [destTable, setDestTable] = useState<string | null>(null);

  const hostTable = host.table_number;
  const rows = useMemo(
    () => buildTableRows(guests, tables, defaultCapacity),
    [guests, tables, defaultCapacity],
  );
  const hostRow = useMemo(() => findHostRow(rows, hostTable), [rows, hostTable]);
  const hostHasCapacity = hostRow?.capacity ?? null; // null when capacity unknown
  const hostFree = hostRow?.capacity != null
    ? hostRow.capacity - hostRow.used
    : null;
  // Host's table is "full" only when capacity is known AND used >= capacity.
  // When capacity is unknown (no event default + no override), we treat
  // the table as having room so the SAME path is preferred.
  const hostFull = hostHasCapacity != null && hostFree != null && hostFree < 1;

  const choices: ModeChoice[] = useMemo(() => {
    const list: ModeChoice[] = [];
    if (hostTable) {
      // SAME — only when host actually has a table to share.
      list.push({
        mode: 'same',
        label: hostFull
          ? `Override · squeeze onto Table ${hostTable}`
          : `Same as host · Table ${hostTable}`,
        description: hostFull
          ? 'Audited as a capacity override. Use when the venue physically pulls in a chair.'
          : hostFree != null
            ? `Companion takes Table ${hostTable} with the host. ${hostFree - 1 < 0 ? 'Past capacity.' : `${hostFree - 1} seat${hostFree - 1 === 1 ? '' : 's'} free after.`}`
            : `Companion sits with the host on Table ${hostTable}.`,
        recommended: !hostFull,
        available: true,
      });
    }
    list.push({
      mode: 'move_both',
      label: 'Move both to a new table',
      description: hostTable
        ? `Re-seat the pair somewhere with 2+ free seats. Host's current Table ${hostTable} gains a seat back.`
        : 'Pick a table for the pair (host has no table yet).',
      recommended: hostFull,
      available: rows.some(
        (r) => r.table_number !== hostTable && (r.capacity == null || r.capacity - r.used >= 2),
      ),
      disabledReason: 'No other table has 2 free seats.',
    });
    list.push({
      mode: 'split',
      label: 'Split · companion sits separately',
      description: hostTable
        ? `Host stays at Table ${hostTable}. Companion gets their own seat elsewhere.`
        : 'Host has no table. Companion still gets their own seat.',
      recommended: false,
      available: rows.some(
        (r) => r.table_number !== hostTable && (r.capacity == null || r.capacity - r.used >= 1),
      ),
      disabledReason: 'No other table has any free seats.',
    });
    return list;
  }, [rows, hostTable, hostFull, hostFree]);

  // Mode selection. Default = first available recommended choice; falls back
  // to first available choice if none are recommended.
  const defaultMode: KioskCompanionMode =
    choices.find((c) => c.recommended && c.available)?.mode ??
    choices.find((c) => c.available)?.mode ??
    'same';
  const [mode, setMode] = useState<KioskCompanionMode>(defaultMode);

  // If the host's room state changes (rare but possible via realtime),
  // re-sync the default mode unless the user has already touched it.
  // Stored as a ref-y pattern: we only auto-update when the effective
  // mode is no longer in the available list.
  const activeChoice = choices.find((c) => c.mode === mode);
  if (activeChoice && !activeChoice.available) {
    // Switch to the first available choice on the next render. This is a
    // user-visible nudge rather than a silent change — they'll see the new
    // selection highlighted and the picker (if any) reset.
    queueMicrotask(() => setMode(defaultMode));
  }

  function reset() {
    setError(null);
    setName(`Guest of ${host.full_name}`);
    setTitle('');
    setContact('');
    setNotes('');
    setDestTable(null);
    setMode(defaultMode);
  }

  function close() {
    reset();
    onClose();
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Companion name is required (placeholder ok — edit later).');
      return;
    }
    if (mode === 'move_both' || mode === 'split') {
      if (!destTable) {
        setError(
          mode === 'move_both'
            ? 'Pick the destination table for the pair.'
            : 'Pick the table for the companion.',
        );
        return;
      }
    }

    // Determine the seat the companion ends up at, then check that table's
    // capacity to set the override flag for the audit. Mirrors the picker's
    // own "fits" logic.
    const companionTable =
      mode === 'same' || mode === 'override'
        ? hostTable
        : destTable;
    let capacityOverride = false;
    if (companionTable) {
      const r = rows.find((x) => x.table_number === companionTable);
      if (r && r.capacity != null && r.used >= r.capacity) {
        capacityOverride = true;
      }
      // Special case: same-table mode when host's table is full is logically
      // an override even though the user picked the convenience option.
      if (mode === 'same' && hostFull) capacityOverride = true;
    }

    startTransition(async () => {
      const res = await kioskAddCompanionAction(eventId, host.guest_id, {
        full_name: trimmedName,
        title: title.trim() || null,
        company: null, // server defaults to host's company
        contact_number: contact.trim() || null,
        email: null,
        notes: notes.trim() || null,
        // Map the UI's "same" choice (when host is full) to the explicit
        // 'override' server mode so the audit row reads correctly.
        mode: mode === 'same' && hostFull ? 'override' : mode,
        new_table: mode === 'move_both' || mode === 'split' ? destTable : null,
        capacity_override: capacityOverride,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onSuccess(res);
      reset();
    });
  }

  // Picker is only relevant for move_both / split.
  const pickerMinFree = mode === 'move_both' ? 2 : 1;
  const pickerExclude = mode === 'move_both' || mode === 'split' ? hostTable ?? undefined : undefined;
  const pickerVisible = mode === 'move_both' || mode === 'split';

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add +1 companion"
      description={
        hostFull
          ? `Table ${hostTable} is full. Pick how to seat the companion.`
          : `Companion of ${host.full_name}. Defaults to the same table; change if needed.`
      }
      size="2xl"
    >
      <form onSubmit={submit} className="space-y-5">
        {/* Mode selector — always visible so the usher sees their options
            even when one is preselected and obvious. */}
        <div>
          <p className={labelClass}>Where will they sit?</p>
          <div className="grid grid-cols-1 gap-2">
            {choices.map((c) => {
              const selected = mode === c.mode;
              return (
                <button
                  key={c.mode}
                  type="button"
                  disabled={!c.available}
                  onClick={() => setMode(c.mode)}
                  className={[
                    'flex w-full items-start justify-between gap-3 rounded-lg border px-4 py-3 text-left transition-colors',
                    selected
                      ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200'
                      : 'border-aegis-gray-200 bg-white hover:bg-aegis-navy-50/30',
                    !c.available ? 'cursor-not-allowed opacity-50' : '',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-aegis-navy">
                      {c.label}
                      {c.recommended && c.available && (
                        <span className="rounded-full bg-aegis-orange/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-aegis-orange-600">
                          Recommended
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-[11px] text-aegis-gray-500">
                      {c.available ? c.description : c.disabledReason}
                    </p>
                  </div>
                  <span
                    className={[
                      'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2',
                      selected
                        ? 'border-emerald-500 bg-emerald-500'
                        : 'border-aegis-gray-300 bg-white',
                    ].join(' ')}
                    aria-hidden
                  >
                    {selected && (
                      <svg
                        className="h-2.5 w-2.5 text-white"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l5 5 9-11" />
                      </svg>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {pickerVisible && (
          <div>
            <p className={labelClass}>
              {mode === 'move_both' ? 'New table for the pair' : 'Companion table'}
            </p>
            <TablePicker
              tables={tables}
              guests={guests}
              defaultCapacity={defaultCapacity}
              value={destTable}
              onChange={setDestTable}
              minFree={pickerMinFree}
              excludeTable={pickerExclude}
              allowUnassigned={false}
              emptyHint={
                mode === 'move_both'
                  ? 'No other table has 2 free seats — try Split or Override.'
                  : 'No other table has free seats.'
              }
            />
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label htmlFor="companion_name" className={labelClass}>
              Companion name *
            </label>
            <input
              id="companion_name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              placeholder='e.g. "Mr. Tan", "Spouse", "Plus one"'
              className={inputClass}
            />
            <p className="mt-1 text-[11px] text-aegis-gray-300">
              Placeholder ok — usher can edit later from the guest list.
            </p>
          </div>
          <div>
            <label htmlFor="companion_title" className={labelClass}>
              Title
            </label>
            <input
              id="companion_title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Optional"
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="companion_contact" className={labelClass}>
              Contact number
            </label>
            <input
              id="companion_contact"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              inputMode="tel"
              placeholder="Optional"
              className={inputClass}
            />
          </div>
        </div>

        <div>
          <label htmlFor="companion_notes" className={labelClass}>
            Notes
          </label>
          <textarea
            id="companion_notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder='Optional — e.g. "spouse", "translator"'
            className={`${inputClass} resize-y`}
          />
        </div>

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

        <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={close}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {pending ? 'Adding…' : 'Add companion'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
