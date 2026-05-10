'use client';

import { useMemo, useState } from 'react';
import type { EventGuest } from '@/lib/types';
import { displayCompany, displayName } from '@/lib/display-format';

// Browse mode for the admin guest list. Mirrors the kiosk's three-way
// breakdown so the admin can scan the same way an usher does:
//   • all       — flat list, sortable (default; legacy view)
//   • table     — grouped by table_number, "No table" bucket last
//   • name      — flat alphabetical list with A/B/C letter dividers
//   • company   — grouped by company, "No company" bucket last
//
// Pending walk-ins are NOT filtered (unlike the kiosk) — admins see the
// full state including rows awaiting supervisor approval.
type ViewMode = 'all' | 'table' | 'name' | 'company';

type SortKey = 'default' | 'table' | 'name';

const SORT_LABEL: Record<SortKey, string> = {
  default: 'Status, then name',
  table: 'Table number',
  name: 'Name (A → Z)',
};

type Group = {
  key: string;
  label: string;
  guests: EventGuest[];
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

// Build groups for the three grouped modes. Returns sections in the
// natural reading order for each mode (numeric for table, alpha for
// name + company), with the "no value" bucket always last.
function groupGuests(guests: EventGuest[], mode: ViewMode): Group[] {
  if (mode === 'all') return [];

  if (mode === 'name') {
    // Alphabetical sections — first letter of full_name, with non-letter
    // first chars (digits, punctuation) bucketed under '#' at the end.
    const sorted = [...guests].sort((a, b) =>
      a.full_name.localeCompare(b.full_name, undefined, { numeric: true }),
    );
    const map = new Map<string, EventGuest[]>();
    for (const g of sorted) {
      const first = g.full_name.trim().charAt(0).toUpperCase();
      const key = /^[A-Z]$/.test(first) ? first : '#';
      const arr = map.get(key) ?? [];
      arr.push(g);
      map.set(key, arr);
    }
    const keys = Array.from(map.keys()).sort();
    const idx = keys.indexOf('#');
    if (idx > -1) {
      keys.splice(idx, 1);
      keys.push('#');
    }
    return keys.map((k) => ({
      key: k,
      label: k,
      guests: map.get(k) ?? [],
    }));
  }

  // table or company
  const map = new Map<string, EventGuest[]>();
  for (const g of guests) {
    const raw =
      mode === 'table' ? g.table_number?.trim() : g.company?.trim();
    const key = raw && raw.length > 0 ? raw : '__none__';
    const arr = map.get(key) ?? [];
    arr.push(g);
    map.set(key, arr);
  }

  const noneGuests = map.get('__none__');
  map.delete('__none__');

  const keys = Array.from(map.keys());
  if (mode === 'table') {
    keys.sort((a, b) => {
      const an = Number.parseInt(a.replace(/\D+/g, ''), 10);
      const bn = Number.parseInt(b.replace(/\D+/g, ''), 10);
      if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) {
        return an - bn;
      }
      return a.localeCompare(b, undefined, { numeric: true });
    });
  } else {
    keys.sort((a, b) => a.localeCompare(b));
  }

  const result: Group[] = keys.map((k) => ({
    key: k,
    label: mode === 'table' ? `Table ${k}` : displayCompany(k),
    guests: (map.get(k) ?? [])
      .slice()
      .sort((a, b) => a.full_name.localeCompare(b.full_name)),
  }));

  if (noneGuests && noneGuests.length > 0) {
    noneGuests.sort((a, b) => a.full_name.localeCompare(b.full_name));
    result.push({
      key: '__none__',
      label: mode === 'table' ? 'No table' : 'No company',
      guests: noneGuests,
    });
  }

  return result;
}

export default function GuestListView({
  guests,
  onPick,
}: {
  guests: EventGuest[];
  onPick: (guest: EventGuest) => void;
}) {
  const [view, setView] = useState<ViewMode>('all');
  const [sortKey, setSortKey] = useState<SortKey>('default');

  const sortedFlat = useMemo(
    () => sortGuests(guests, sortKey),
    [guests, sortKey],
  );
  const groups = useMemo(() => groupGuests(guests, view), [guests, view]);

  if (guests.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-aegis-gray-500">
        No guests yet — add one or import a CSV.
      </p>
    );
  }

  return (
    <>
      {/* View picker — same orange-underline tab style as elsewhere in
          the app. Sort is only meaningful on the flat "All" view; for
          grouped views the in-group ordering is name-A→Z and the
          group order is mode-specific (numeric for table, alpha for
          letter / company), so we hide the sort dropdown there. */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-aegis-gray-100 px-4 py-2 sm:px-5">
        <div
          role="tablist"
          aria-label="Guest list view"
          className="-mx-1 flex gap-1 overflow-x-auto px-1"
        >
          {(
            [
              { key: 'all', label: 'All' },
              { key: 'table', label: 'By table' },
              { key: 'name', label: 'By name' },
              { key: 'company', label: 'By company' },
            ] as const
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={view === key}
              onClick={() => setView(key)}
              className={[
                'shrink-0 rounded-md px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.06em] transition-colors',
                view === key
                  ? 'bg-aegis-navy text-white'
                  : 'text-aegis-gray-500 hover:bg-aegis-gray-50 hover:text-aegis-navy',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {view === 'all' && (
          <div className="flex items-center gap-2 text-[11px]">
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
        )}
      </div>

      {view === 'all' ? (
        <FlatList guests={sortedFlat} onPick={onPick} />
      ) : (
        <GroupedList groups={groups} onPick={onPick} />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Flat list (the legacy view) — table on sm+, cards on mobile.
// ─────────────────────────────────────────────────────────────────────

function FlatList({
  guests,
  onPick,
}: {
  guests: EventGuest[];
  onPick: (guest: EventGuest) => void;
}) {
  return (
    <>
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
            {guests.map((g) => (
              <GuestRow key={g.guest_id} guest={g} onPick={onPick} />
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-aegis-gray-100 sm:hidden">
        {guests.map((g) => (
          <GuestCard key={g.guest_id} guest={g} onPick={onPick} />
        ))}
      </ul>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Grouped list — section header per group, same row UI underneath.
// ─────────────────────────────────────────────────────────────────────

function GroupedList({
  groups,
  onPick,
}: {
  groups: Group[];
  onPick: (guest: EventGuest) => void;
}) {
  return (
    <div>
      {groups.map((group) => {
        const checkedIn = group.guests.filter((g) => g.checked_in).length;
        return (
          <section key={group.key}>
            <div className="sticky top-0 z-[1] flex items-baseline justify-between gap-2 border-b border-aegis-gray-100 bg-aegis-gray-50/95 px-4 py-1.5 backdrop-blur supports-[backdrop-filter]:bg-aegis-gray-50/80 sm:px-5">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
                {group.label}
              </h4>
              <span className="text-[11px] tabular-nums text-aegis-gray-400">
                {checkedIn}
                <span className="opacity-60"> / </span>
                {group.guests.length}
              </span>
            </div>

            {/* Table on sm+ — but no thead inside groups, since the
                section header already names the bucket. Keeps the
                visual hierarchy tight (no repeated column headers). */}
            <div className="hidden overflow-x-auto sm:block">
              <table className="w-full text-left text-sm">
                <tbody className="divide-y divide-aegis-gray-100">
                  {group.guests.map((g) => (
                    <GuestRow key={g.guest_id} guest={g} onPick={onPick} />
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="divide-y divide-aegis-gray-100 sm:hidden">
              {group.guests.map((g) => (
                <GuestCard key={g.guest_id} guest={g} onPick={onPick} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// Shared row + card components so the flat and grouped views stay
// visually identical at the leaf level.

function GuestRow({
  guest,
  onPick,
}: {
  guest: EventGuest;
  onPick: (guest: EventGuest) => void;
}) {
  return (
    <tr
      onClick={() => onPick(guest)}
      className={[
        'cursor-pointer transition-colors',
        guest.checked_in
          ? 'bg-emerald-50/40 hover:bg-emerald-50'
          : 'hover:bg-aegis-navy-50/40',
      ].join(' ')}
    >
      <td className="px-5 py-3.5 font-medium text-aegis-navy">
        {displayName(guest.full_name)}
      </td>
      <td className="px-5 py-3.5 text-aegis-gray">
        {guest.title ? displayName(guest.title) : '—'}
      </td>
      <td className="px-5 py-3.5 text-aegis-gray">
        {guest.company ? displayCompany(guest.company) : '—'}
      </td>
      <td className="px-5 py-3.5">
        <TableBadge value={guest.table_number} />
      </td>
      <td className="px-5 py-3.5">
        <StatusPill checkedIn={guest.checked_in} />
      </td>
    </tr>
  );
}

function GuestCard({
  guest,
  onPick,
}: {
  guest: EventGuest;
  onPick: (guest: EventGuest) => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={() => onPick(guest)}
        className={[
          'flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors',
          guest.checked_in
            ? 'bg-emerald-50/40'
            : 'hover:bg-aegis-navy-50/40',
        ].join(' ')}
      >
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-aegis-navy">
            {displayName(guest.full_name)}
          </p>
          <p className="text-[11px] text-aegis-gray-500">
            {[
              guest.title ? displayName(guest.title) : null,
              guest.company ? displayCompany(guest.company) : null,
            ]
              .filter(Boolean)
              .join(' · ') || '—'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill checkedIn={guest.checked_in} />
          <TableBadge value={guest.table_number} />
        </div>
      </button>
    </li>
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
