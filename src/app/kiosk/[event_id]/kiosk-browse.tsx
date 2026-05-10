'use client';

import { useMemo, useState } from 'react';
import { displayCompany, displayName, displayPhone } from '@/lib/display-format';
import {
  GUEST_TIER_CHIP_CLASS,
  GUEST_TIER_LABEL,
  type EventGuest,
} from '@/lib/types';

// Browse-mode list for the kiosk.
//
// Three groupings driven by the `mode` prop:
//   • table    — group by table_number, "no table" bucket last
//   • name     — flat alphabetical list with letter section dividers
//   • company  — group by company, "no company" bucket last
//
// Each row supports two interactions:
//   • single-tap → immediate check-in (preserves the kiosk's
//                  default workflow when the usher knows the guest)
//   • select toggle on the leading checkbox → adds to a multi-select
//                  set; a bottom action bar bulk-checks-in the lot
//
// Pending walk-ins are filtered out — they have to clear the
// supervisor approval queue, not be bulk-flipped.

type Mode = 'table' | 'name' | 'company';

type Group = {
  key: string;
  // What we render in the section header (formatted)
  label: string;
  guests: EventGuest[];
};

export default function KioskBrowse({
  mode,
  guests,
  isCheckedIn,
  pending,
  onPick,
  onBulk,
}: {
  mode: Mode;
  guests: EventGuest[];
  isCheckedIn: (g: EventGuest) => boolean;
  pending: boolean;
  /** Single-row tap — immediate check-in. */
  onPick: (g: EventGuest) => void;
  /** Bulk action — receives the selected guest_ids. */
  onBulk: (guest_ids: string[]) => void | Promise<void>;
}) {
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter out pending walk-ins regardless of grouping. The kiosk
  // header pill is the route into the approval queue for those.
  const eligible = useMemo(
    () => guests.filter((g) => g.walkin_status !== 'pending'),
    [guests],
  );

  const groups = useMemo<Group[]>(() => {
    if (mode === 'name') {
      // Flat alphabetical list, partitioned by first letter of the
      // display name. Non-letters bucket under '#' so digits / honorifics
      // don't get a misleading 'A' header.
      const sorted = [...eligible].sort((a, b) =>
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
      // Move '#' to the end if it exists.
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

    // table / company — same shape: group by a key, "no-X" bucket last.
    const map = new Map<string, EventGuest[]>();
    for (const g of eligible) {
      const raw =
        mode === 'table' ? g.table_number?.trim() : g.company?.trim();
      const key = raw && raw.length > 0 ? raw : '__none__';
      const arr = map.get(key) ?? [];
      arr.push(g);
      map.set(key, arr);
    }

    const result: Group[] = [];
    const noneGuests = map.get('__none__');
    map.delete('__none__');

    const keys = Array.from(map.keys());
    if (mode === 'table') {
      // Numeric table-number sort: "Table 2" before "Table 10"; falls
      // back to locale compare for "VIP-A" / "Stage Left".
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

    for (const k of keys) {
      const list = (map.get(k) ?? []).slice().sort((a, b) =>
        a.full_name.localeCompare(b.full_name),
      );
      result.push({
        key: k,
        label: mode === 'table' ? `Table ${k}` : displayCompany(k),
        guests: list,
      });
    }

    if (noneGuests && noneGuests.length > 0) {
      noneGuests.sort((a, b) => a.full_name.localeCompare(b.full_name));
      result.push({
        key: '__none__',
        label: mode === 'table' ? 'No table' : 'No company',
        guests: noneGuests,
      });
    }
    return result;
  }, [eligible, mode]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectGroup(group: Group) {
    // Add every not-yet-checked-in guest from the group to the
    // selection. Already-checked-in rows skip — they'd just be
    // counted as "skipped already" by the server.
    setSelectMode(true);
    setSelected((prev) => {
      const next = new Set(prev);
      for (const g of group.guests) {
        if (!isCheckedIn(g)) next.add(g.guest_id);
      }
      return next;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function commitBulk() {
    const ids = Array.from(selected);
    if (ids.length === 0) return;
    await onBulk(ids);
    setSelected(new Set());
    setSelectMode(false);
  }

  const total = eligible.length;
  const selectableCount = eligible.filter((g) => !isCheckedIn(g)).length;

  if (total === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-aegis-gray-200 bg-white px-6 py-12 text-center">
        <p className="text-sm text-aegis-gray-500">
          No guests on the list yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Toolbar: select-mode toggle + counts */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-aegis-gray-500 tabular-nums">
          {total} guest{total === 1 ? '' : 's'}
          {selectableCount < total && (
            <span className="ml-1 text-aegis-gray-300">
              · {total - selectableCount} already in
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={() => {
            setSelectMode((m) => !m);
            if (selectMode) clearSelection();
          }}
          className={[
            'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
            selectMode
              ? 'bg-aegis-navy text-white hover:bg-aegis-navy/90'
              : 'border border-aegis-gray-200 bg-white text-aegis-navy hover:bg-aegis-gray-50',
          ].join(' ')}
        >
          {selectMode ? 'Cancel select' : 'Select multiple'}
        </button>
      </div>

      {/* Grouped / flat list */}
      <div className="space-y-4">
        {groups.map((group) => {
          const remainingInGroup = group.guests.filter(
            (g) => !isCheckedIn(g),
          ).length;
          return (
            <section key={group.key}>
              <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1">
                <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-aegis-gray-500">
                  {group.label}
                  <span className="text-aegis-gray-300">
                    · {group.guests.length}
                    {remainingInGroup > 0 && remainingInGroup < group.guests.length && (
                      <span> ({remainingInGroup} pending)</span>
                    )}
                  </span>
                </h3>
                {selectMode && remainingInGroup > 0 && (
                  <button
                    type="button"
                    onClick={() => selectGroup(group)}
                    className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
                  >
                    Select all
                  </button>
                )}
              </div>
              <ul className="divide-y divide-aegis-gray-100 overflow-hidden rounded-xl border border-aegis-gray-100 bg-white">
                {group.guests.map((g) => {
                  const checked = isCheckedIn(g);
                  const isSelected = selected.has(g.guest_id);
                  return (
                    <li key={g.guest_id}>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          if (selectMode) {
                            // Don't toggle already-checked-in rows in
                            // select mode — they'd just be counted as
                            // skipped-already on submit.
                            if (checked) return;
                            toggleSelected(g.guest_id);
                          } else {
                            onPick(g);
                          }
                        }}
                        className={[
                          'flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors disabled:opacity-60 sm:px-5 sm:py-3',
                          checked
                            ? 'bg-emerald-50/60 hover:bg-emerald-50'
                            : isSelected
                              ? 'bg-aegis-navy-50/60 hover:bg-aegis-navy-50/80'
                              : 'hover:bg-aegis-gray-50',
                        ].join(' ')}
                      >
                        {selectMode && (
                          <span
                            aria-hidden
                            className={[
                              'flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
                              checked
                                ? 'border-emerald-300 bg-emerald-100 text-emerald-700'
                                : isSelected
                                  ? 'border-aegis-navy bg-aegis-navy text-white'
                                  : 'border-aegis-gray-300 bg-white',
                            ].join(' ')}
                          >
                            {(checked || isSelected) && (
                              <svg
                                className="h-3 w-3"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M5 12l5 5 9-11" />
                              </svg>
                            )}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-aegis-navy">
                            {g.honorific && (
                              <span className="mr-1 text-aegis-orange-600">
                                {g.honorific}
                              </span>
                            )}
                            {displayName(g.preferred_name ?? g.full_name)}
                          </p>
                          <p className="truncate text-[11px] text-aegis-gray-500">
                            {[
                              g.title ? displayName(g.title) : null,
                              mode !== 'company' && g.company
                                ? displayCompany(g.company)
                                : null,
                              mode !== 'table' && g.table_number
                                ? `T·${g.table_number}`
                                : null,
                              g.contact_number
                                ? displayPhone(g.contact_number)
                                : null,
                            ]
                              .filter(Boolean)
                              .join(' · ') || '—'}
                          </p>
                        </div>
                        {GUEST_TIER_CHIP_CLASS[g.tier] && (
                          <span
                            className={[
                              'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                              GUEST_TIER_CHIP_CLASS[g.tier] as string,
                            ].join(' ')}
                          >
                            {GUEST_TIER_LABEL[g.tier]}
                          </span>
                        )}
                        {checked && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">
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
                            In
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Bulk action bar — fixed at the bottom while a selection is
          active. Sticky inside the kiosk's main scroll context, with
          a backdrop blur so the rows underneath don't bleed through. */}
      {selectMode && selected.size > 0 && (
        <div className="sticky bottom-3 z-20 mt-4 flex items-center justify-between gap-3 rounded-xl border border-aegis-navy/20 bg-white/95 px-4 py-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-white/80">
          <p className="text-sm font-medium text-aegis-navy tabular-nums">
            {selected.size} selected
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={commitBulk}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M5 12l5 5 9-11" />
              </svg>
              Check in {selected.size}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
