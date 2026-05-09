// Shared seating helpers — used by the event detail page's Seating section
// and by the kiosk's TablePicker (walk-in, +1 companion, table swap).
//
// Pure data manipulation: no React, no Supabase. Both consumers fetch their
// own copies of guests + overrides and pass them in.

import type { EventGuest, EventTable, TableSection } from '@/lib/types';

export type TableRow = {
  table_number: string;
  /** null when neither the event default nor an override is set */
  capacity: number | null;
  label: string | null;
  /** Audience this table is reserved for. Falls back to 'mixed' when no
   *  override row exists (i.e. the table was inferred from a guest's
   *  table_number assignment). */
  section: TableSection;
  /** Saved position on the floor-plan canvas. null when no override row
   *  exists yet OR the override exists but x/y haven't been set. The
   *  floor-plan view auto-arranges any row whose x or y is null. */
  x: number | null;
  y: number | null;
  /** true if this row is a row in event_tables (i.e. has a custom limit/label) */
  override: boolean;
  used: number;
};

export type CapacityTone = 'green' | 'amber' | 'red' | 'gray';

// Combines override rows + every table that has at least one guest. Rows are
// sorted numerically when possible ("Table 2" before "Table 10") and fall
// back to locale-aware compare for non-numeric labels like "VIP-A" or
// "Stage Left". The check-in floor cares more about ordering by capacity in
// the picker, but this helper keeps a stable, predictable order at the top
// level — picker callers can re-sort.
export function buildTableRows(
  guests: EventGuest[],
  overrides: EventTable[],
  defaultCapacity: number | null,
): TableRow[] {
  const usage = new Map<string, number>();
  for (const g of guests) {
    const t = g.table_number?.trim();
    if (!t) continue;
    usage.set(t, (usage.get(t) ?? 0) + 1);
  }
  const overrideMap = new Map(overrides.map((o) => [o.table_number, o] as const));

  const all = new Set<string>([...overrideMap.keys(), ...usage.keys()]);

  const rows: TableRow[] = [];
  for (const t of all) {
    const ov = overrideMap.get(t);
    rows.push({
      table_number: t,
      capacity: ov?.capacity ?? defaultCapacity,
      label: ov?.label ?? null,
      section: ov?.section ?? 'mixed',
      x: ov?.x ?? null,
      y: ov?.y ?? null,
      override: !!ov,
      used: usage.get(t) ?? 0,
    });
  }

  rows.sort((a, b) => {
    const an = Number.parseInt(a.table_number.replace(/\D+/g, ''), 10);
    const bn = Number.parseInt(b.table_number.replace(/\D+/g, ''), 10);
    if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
    return a.table_number.localeCompare(b.table_number, undefined, {
      numeric: true,
    });
  });
  return rows;
}

// Visual tone for a "used / capacity" badge.
//   • capacity == null → gray (no limit defined)
//   • used > capacity  → red (over)
//   • used >= capacity → amber (at limit)
//   • used / capacity >= 0.8 → amber (filling up; warn the usher early so
//                              they can re-route a walk-in before it spills)
//   • otherwise → green
export function capacityTone(used: number, capacity: number | null): CapacityTone {
  if (capacity == null) return 'gray';
  if (used > capacity) return 'red';
  if (used >= capacity) return 'amber';
  if (used / capacity >= 0.8) return 'amber';
  return 'green';
}

export function freeSeats(row: TableRow): number | null {
  if (row.capacity == null) return null;
  return row.capacity - row.used;
}

export const CAPACITY_TONE_CLASS: Record<CapacityTone, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-red-50 text-red-700 ring-red-200',
  gray: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
};
