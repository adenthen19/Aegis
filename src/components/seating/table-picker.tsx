'use client';

import { useMemo } from 'react';
import {
  TABLE_SECTION_LABEL,
  tierMatchesSection,
  type EventGuest,
  type EventTable,
  type GuestTier,
  type TableSection,
} from '@/lib/types';
import {
  buildTableRows,
  CAPACITY_TONE_CLASS,
  capacityTone,
  type TableRow,
} from '@/lib/seating';

// Same chip palette as in seating-section so the picker visually matches
// what the admin sees when configuring tables.
const SECTION_CHIP_CLASS: Record<TableSection, string | null> = {
  vip: 'bg-aegis-gold-50 text-aegis-orange-600 ring-aegis-gold/40',
  analyst: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  kol: 'bg-violet-50 text-violet-700 ring-violet-200',
  media: 'bg-rose-50 text-rose-700 ring-rose-200',
  mixed: null,
};

// Reusable picker for the three check-in floor flows:
//   • walk-in (no registration)        → minFree = 1, allowUnassigned = true
//   • +1 companion, both move          → minFree = 2
//   • +1 companion, split              → minFree = 1
//   • bulk table swap (destination)    → minFree = N (size of source table)
//
// Shows every table that exists (overrides + auto-discovered from guest
// assignments), sorted by free seats descending so the usher's eye lands
// on "most room" first. Tables that don't meet `minFree` are dimmed but
// still visible — usher knows we considered them. When capacity is unknown
// (no event default + no override on that table), the row stays selectable
// and shows "∞" so behaviour mirrors the pre-capacity world.

type Props = {
  tables: EventTable[];
  guests: EventGuest[];
  defaultCapacity: number | null;
  value: string | null;
  onChange: (tableNumber: string | null) => void;
  /** Minimum free seats required for a table to be considered "fits". Default 1. */
  minFree?: number;
  /** Hide a specific table (used when picking a destination DIFFERENT from source). */
  excludeTable?: string;
  /** Show a "No table / unassigned" row at the top. Default true. */
  allowUnassigned?: boolean;
  /** Optional empty-state hint when no tables match. */
  emptyHint?: string;
  /** Tier of the guest being seated. When set, we surface a section-mismatch
   *  warning on rows whose section doesn't match (e.g. seating an analyst
   *  at a media table). Soft only — the row stays selectable. */
  guestTier?: GuestTier;
};

type PickerRow = TableRow & {
  free: number | null; // null when capacity unknown — treated as ∞
  fits: boolean; // does it meet minFree?
};

function decorate(row: TableRow, minFree: number): PickerRow {
  const free = row.capacity == null ? null : row.capacity - row.used;
  const fits = free == null || free >= minFree;
  return { ...row, free, fits };
}

export default function TablePicker({
  tables,
  guests,
  defaultCapacity,
  value,
  onChange,
  minFree = 1,
  excludeTable,
  allowUnassigned = true,
  emptyHint,
  guestTier,
}: Props) {
  const rows = useMemo<PickerRow[]>(() => {
    const base = buildTableRows(guests, tables, defaultCapacity);
    const filtered = excludeTable
      ? base.filter((r) => r.table_number !== excludeTable)
      : base;
    const decorated = filtered.map((r) => decorate(r, minFree));
    // Sort: fitting rows first, then by free seats DESC (most free first),
    // then by table number for stability. Within "doesn't fit", keep their
    // original numeric order so a 9/10 sits before a FULL row.
    decorated.sort((a, b) => {
      if (a.fits !== b.fits) return a.fits ? -1 : 1;
      const af = a.free ?? Number.POSITIVE_INFINITY;
      const bf = b.free ?? Number.POSITIVE_INFINITY;
      if (af !== bf) return bf - af;
      return a.table_number.localeCompare(b.table_number, undefined, {
        numeric: true,
      });
    });
    return decorated;
  }, [guests, tables, defaultCapacity, minFree, excludeTable]);

  const fitsCount = rows.filter((r) => r.fits).length;

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-aegis-gray-500">
        {minFree > 1
          ? `Showing tables with at least ${minFree} free seats first. Full or near-full tables are dimmed.`
          : 'Sorted by free seats — most-free first.'}
      </p>

      <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-aegis-gray-100">
        {allowUnassigned && (
          <PickerOption
            selected={value === null}
            onClick={() => onChange(null)}
          >
            <div className="flex-1 text-left">
              <p className="text-sm font-medium text-aegis-navy">No table</p>
              <p className="text-[11px] text-aegis-gray-500">
                Unassigned — host will seat them later
              </p>
            </div>
          </PickerOption>
        )}

        {rows.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-aegis-gray-500">
            {emptyHint ?? 'No tables to show.'}
          </div>
        ) : (
          rows.map((r) => {
            const tone = capacityTone(r.used, r.capacity);
            const selected = value === r.table_number;
            return (
              <PickerOption
                key={r.table_number}
                selected={selected}
                disabled={!r.fits}
                onClick={() => onChange(r.table_number)}
              >
                <div className="min-w-0 flex-1 text-left">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-aegis-navy">
                    <span className="rounded bg-aegis-gold-50 px-1.5 py-0.5 text-xs font-bold uppercase tracking-wide text-aegis-orange-600 ring-1 ring-inset ring-aegis-gold/40">
                      Table {r.table_number}
                    </span>
                    {SECTION_CHIP_CLASS[r.section] && (
                      <span
                        className={[
                          'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ring-1 ring-inset',
                          SECTION_CHIP_CLASS[r.section] as string,
                        ].join(' ')}
                      >
                        {TABLE_SECTION_LABEL[r.section]}
                      </span>
                    )}
                    {r.label && (
                      <span className="text-xs font-normal text-aegis-gray-500">
                        {r.label}
                      </span>
                    )}
                    {r.override && (
                      <span className="rounded-full bg-aegis-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-aegis-navy ring-1 ring-inset ring-aegis-blue/30">
                        Override
                      </span>
                    )}
                    {/* Section mismatch — soft amber warning. Only shows
                        when the caller passed a tier and it doesn't match
                        this row's section (and section isn't 'mixed'). */}
                    {guestTier && !tierMatchesSection(guestTier, r.section) && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 ring-1 ring-inset ring-amber-300">
                        Section mismatch
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-[11px] text-aegis-gray-500">
                    {r.capacity == null
                      ? 'No capacity set — unlimited'
                      : r.fits
                        ? `${r.free} free`
                        : r.free === 0
                          ? 'Full'
                          : `Only ${r.free} free — needs ${minFree}`}
                  </p>
                </div>
                <span
                  className={[
                    'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset',
                    CAPACITY_TONE_CLASS[tone],
                  ].join(' ')}
                >
                  {r.used}
                  <span className="opacity-60">/</span>
                  {r.capacity ?? '∞'}
                  {r.capacity != null && r.used > r.capacity && (
                    <span className="ml-1 uppercase tracking-wide">over</span>
                  )}
                </span>
              </PickerOption>
            );
          })
        )}
      </div>

      {minFree > 1 && fitsCount === 0 && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
          No table has {minFree} free seats. You can still pick a dimmed
          option to override capacity (audited), or split / seat separately
          instead.
        </p>
      )}
    </div>
  );
}

function PickerOption({
  selected,
  disabled,
  onClick,
  children,
}: {
  selected: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Dimmed rows stay clickable on purpose — usher can deliberately
      // override a full table when the venue physically pulls in a chair.
      // The opacity + warning copy in the row itself signal "you'll be
      // seating past capacity."
      className={[
        'flex w-full items-center justify-between gap-3 border-b border-aegis-gray-100 px-4 py-3 text-left transition-colors last:border-b-0',
        selected
          ? 'bg-emerald-50 ring-2 ring-inset ring-emerald-300'
          : 'bg-white hover:bg-aegis-navy-50/30',
        disabled ? 'opacity-50' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
