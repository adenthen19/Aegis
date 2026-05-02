'use client';

import { useMemo, useState } from 'react';
import type { EventGuest } from '@/lib/types';

type SortKey = 'default' | 'table' | 'name';

const SORT_LABEL: Record<SortKey, string> = {
  default: 'Status, then name',
  table: 'Table number',
  name: 'Name (A → Z)',
};

// Numeric tables sort numerically (Table 2 before Table 10), text falls
// back to alpha. Guests with no table land last so the floor plan reads
// top-down.
function compareTable(a: string | null, b: string | null): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const an = Number(a);
  const bn = Number(b);
  if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
  return a.localeCompare(b);
}

function sortGuests(guests: EventGuest[], key: SortKey): EventGuest[] {
  const copy = [...guests];
  if (key === 'table') {
    copy.sort((a, b) => {
      const t = compareTable(a.table_number, b.table_number);
      if (t !== 0) return t;
      return a.full_name.localeCompare(b.full_name);
    });
  } else if (key === 'name') {
    copy.sort((a, b) => a.full_name.localeCompare(b.full_name));
  } else {
    // default: not-checked-in first (so the next person to check in is at
    // the top), then alpha within each group.
    copy.sort((a, b) => {
      if (a.checked_in !== b.checked_in) return a.checked_in ? 1 : -1;
      return a.full_name.localeCompare(b.full_name);
    });
  }
  return copy;
}

export default function GuestListView({
  guests,
  onPick,
}: {
  guests: EventGuest[];
  onPick: (guest: EventGuest) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const sorted = useMemo(() => sortGuests(guests, sortKey), [guests, sortKey]);

  if (guests.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-aegis-gray-500">
        No guests yet — add one or import a CSV.
      </p>
    );
  }

  return (
    <>
      <div className="flex items-center justify-end gap-2 border-b border-aegis-gray-100 px-4 py-2 text-[11px] sm:px-5">
        <label
          htmlFor="guest-sort"
          className="font-medium uppercase tracking-[0.08em] text-aegis-gray-500"
        >
          Sort
        </label>
        <select
          id="guest-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-md border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-aegis-navy outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-aegis-gray-100 bg-aegis-gray-50/60">
              <Th>Name</Th>
              <Th>Title</Th>
              <Th>Company</Th>
              <Th>Table</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aegis-gray-100">
            {sorted.map((g) => (
              <tr
                key={g.guest_id}
                onClick={() => onPick(g)}
                className={[
                  'cursor-pointer transition-colors',
                  g.checked_in
                    ? 'bg-emerald-50/40 hover:bg-emerald-50'
                    : 'hover:bg-aegis-navy-50/40',
                ].join(' ')}
              >
                <td className="px-5 py-3.5 font-medium text-aegis-navy">{g.full_name}</td>
                <td className="px-5 py-3.5 text-aegis-gray">{g.title || '—'}</td>
                <td className="px-5 py-3.5 text-aegis-gray">{g.company || '—'}</td>
                <td className="px-5 py-3.5">
                  <TableBadge value={g.table_number} />
                </td>
                <td className="px-5 py-3.5">
                  <StatusPill checkedIn={g.checked_in} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-aegis-gray-100 sm:hidden">
        {sorted.map((g) => (
          <li key={g.guest_id}>
            <button
              type="button"
              onClick={() => onPick(g)}
              className={[
                'flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors',
                g.checked_in ? 'bg-emerald-50/40' : 'hover:bg-aegis-navy-50/40',
              ].join(' ')}
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-aegis-navy">{g.full_name}</p>
                <p className="text-[11px] text-aegis-gray-500">
                  {[g.title, g.company].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <StatusPill checkedIn={g.checked_in} />
                <TableBadge value={g.table_number} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-5 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
      {children}
    </th>
  );
}

function TableBadge({ value }: { value: string | null }) {
  if (!value) return <span className="text-aegis-gray-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-aegis-blue-50 px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-aegis-navy ring-1 ring-inset ring-aegis-blue/30">
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
        <path d="M3 10h18M5 10v10M19 10v10M3 6h18" />
      </svg>
      {value}
    </span>
  );
}

function StatusPill({ checkedIn }: { checkedIn: boolean }) {
  return (
    <span
      className={[
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
        checkedIn
          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
          : 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
      ].join(' ')}
    >
      {checkedIn ? (
        <>
          <svg
            className="h-3 w-3"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M5 12l5 5 9-11" />
          </svg>
          Checked in
        </>
      ) : (
        'Pending'
      )}
    </span>
  );
}
