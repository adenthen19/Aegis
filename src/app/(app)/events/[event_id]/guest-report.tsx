'use client';

import { useMemo, useState } from 'react';
import type { CheckinFeedEntry } from './page';
import {
  EVENT_CHECKIN_SOURCE_LABEL,
  GUEST_TIER_LABEL,
  type EventCheckinAction,
  type EventGuest,
  type GuestTier,
} from '@/lib/types';
import { NO_TABLE_SENTINEL } from '@/lib/event-export-filter';
import PushToSheetButton from './push-to-sheet-button';

const ALL_TIERS: GuestTier[] = ['vip', 'analyst', 'kol', 'media', 'standard'];

type ReportTab = 'company' | 'table' | 'activity';

// Activity feed micro-copy. Slots into "<guest_name> <verb> by <user>".
const ACTIVITY_VERB: Record<EventCheckinAction, string> = {
  checkin: 'checked in',
  undo: 'was un-checked',
  walkin_add: 'was added as a walk-in',
  walkin_request: ' submitted a walk-in (awaiting approval)',
  walkin_approve: "'s walk-in was approved",
  walkin_reject: "'s walk-in was rejected",
  substitute_register: ' was registered as a same-firm substitute',
  companion_add: 'was added as a +1 companion',
  table_swap: "'s table was changed",
  capacity_override: ' was seated past capacity',
};

function formatRelative(iso: string): string {
  // Compact relative-time helper for the activity feed. Falls back to an
  // absolute date once entries get older than a day so the feed never lies
  // about freshness during a multi-session event.
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 60_000) return 'just now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function GuestReport({
  eventId,
  eventName,
  guests,
  activity,
  googleSheetId,
  googleConnected,
  googleEmail,
}: {
  eventId: string;
  eventName: string;
  guests: EventGuest[];
  activity: CheckinFeedEntry[];
  googleSheetId: string | null;
  googleConnected: boolean;
  googleEmail: string | null;
}) {
  // Export filter — selected tier(s) / table(s). Empty set = "no filter
  // on this dimension" (the API treats a missing param the same way).
  // The summary stat cards stay on the full event so the host can see
  // the unfiltered headline numbers above the filtered downloads.
  const [selectedTiers, setSelectedTiers] = useState<Set<GuestTier>>(
    () => new Set(),
  );
  const [selectedTables, setSelectedTables] = useState<Set<string>>(
    () => new Set(),
  );

  // Distinct tables present in this event's guest list — used to render
  // the table filter checklist. NO_TABLE_SENTINEL covers unassigned
  // guests as its own selectable group.
  const tableOptions = useMemo(() => {
    const set = new Set<string>();
    let hasNone = false;
    for (const g of guests) {
      const t = g.table_number?.trim();
      if (t && t.length > 0) set.add(t);
      else hasNone = true;
    }
    const arr = Array.from(set).sort((a, b) => {
      const an = Number(a);
      const bn = Number(b);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.localeCompare(b);
    });
    if (hasNone) arr.push(NO_TABLE_SENTINEL);
    return arr;
  }, [guests]);

  const filterQuery = useMemo(() => {
    const sp = new URLSearchParams();
    if (selectedTiers.size > 0) {
      sp.set('tiers', Array.from(selectedTiers).join(','));
    }
    if (selectedTables.size > 0) {
      sp.set('tables', Array.from(selectedTables).join(','));
    }
    const s = sp.toString();
    return s ? `?${s}` : '';
  }, [selectedTiers, selectedTables]);

  // Live count so the host knows roughly how many rows the export will
  // contain before they click download.
  const filteredCount = useMemo(() => {
    if (selectedTiers.size === 0 && selectedTables.size === 0) {
      return guests.length;
    }
    return guests.filter((g) => {
      if (selectedTiers.size > 0 && !selectedTiers.has(g.tier)) return false;
      if (selectedTables.size > 0) {
        const t = g.table_number?.trim();
        const key = t && t.length > 0 ? t : NO_TABLE_SENTINEL;
        if (!selectedTables.has(key)) return false;
      }
      return true;
    }).length;
  }, [guests, selectedTiers, selectedTables]);

  const filterActive =
    selectedTiers.size > 0 || selectedTables.size > 0;

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;
  const pending = total - checkedIn;
  const pct = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

  // Sub-tab inside the report. Defaults to "By company" — the most
  // commonly-asked question post-event ("which firms turned up?"). The
  // stat cards + attendance bar above the tabs stay visible on every
  // tab so the host always sees the headline numbers.
  const [tab, setTab] = useState<ReportTab>('company');

  // Per-company breakdown — useful for spotting which firms turned up.
  // Anything without a company is grouped as "Independent / unknown".
  const byCompany = useMemo(() => {
    const map = new Map<string, { total: number; checkedIn: number }>();
    for (const g of guests) {
      const key = (g.company?.trim() || 'Independent / unknown').slice(0, 60);
      const slot = map.get(key) ?? { total: 0, checkedIn: 0 };
      slot.total += 1;
      if (g.checked_in) slot.checkedIn += 1;
      map.set(key, slot);
    }
    return Array.from(map.entries())
      .map(([company, c]) => ({ company, ...c }))
      .sort((a, b) => b.total - a.total);
  }, [guests]);

  // Per-table breakdown — for the host walking the room. Sort numerically
  // when the table number parses as an integer (Table 2 < Table 10),
  // otherwise alphabetically. Guests with no table land in a separate
  // "No table" group that always sorts last.
  const byTable = useMemo(() => {
    const map = new Map<string, EventGuest[]>();
    for (const g of guests) {
      const key = g.table_number?.trim() || '__none__';
      const arr = map.get(key) ?? [];
      arr.push(g);
      map.set(key, arr);
    }
    const entries = Array.from(map.entries()).map(([table_number, list]) => ({
      table_number,
      guests: list.sort((a, b) => a.full_name.localeCompare(b.full_name)),
      total: list.length,
      checkedIn: list.filter((g) => g.checked_in).length,
    }));
    entries.sort((a, b) => {
      if (a.table_number === '__none__') return 1;
      if (b.table_number === '__none__') return -1;
      const an = Number(a.table_number);
      const bn = Number(b.table_number);
      if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
      return a.table_number.localeCompare(b.table_number);
    });
    return entries;
  }, [guests]);

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <p className="text-[11px] uppercase tracking-[0.08em] text-aegis-gray-500">
          Attendance report — {eventName}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`/api/events/${eventId}/attendance/pdf${filterQuery}`}
            className="inline-flex items-center gap-1.5 rounded-md bg-aegis-orange px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-aegis-orange-600"
            title={
              filterActive
                ? `Branded PDF report — filtered to ${filteredCount} guest${filteredCount === 1 ? '' : 's'}.`
                : 'Branded PDF report — designed for sharing with the client.'
            }
          >
            <DownloadIcon />
            PDF report
          </a>
          <a
            href={`/api/events/${eventId}/attendance/xlsx${filterQuery}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            title={
              filterActive
                ? `Excel workbook — filtered to ${filteredCount} guest${filteredCount === 1 ? '' : 's'}.`
                : 'Formatted Excel workbook with Summary + Guest List sheets.'
            }
          >
            <DownloadIcon />
            Excel
          </a>
          <a
            href={`/api/events/${eventId}/attendance${filterQuery}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50"
            title={
              filterActive
                ? `Raw CSV — filtered to ${filteredCount} guest${filteredCount === 1 ? '' : 's'}.`
                : 'Raw CSV — handy for spreadsheet imports.'
            }
          >
            <DownloadIcon />
            CSV
          </a>
          <PushToSheetButton
            eventId={eventId}
            defaultSheetId={googleSheetId}
            googleConnected={googleConnected}
            googleEmail={googleEmail}
          />
        </div>
      </div>

      {/* Export filter — checkboxes for tier + table. Empty selection on
          a dimension means "no filter" (export everyone). The download
          links above pick up the query string built from this state, so
          the filter never alters what the host sees on this page — only
          what they take away. */}
      <ExportFilter
        tiers={selectedTiers}
        onToggleTier={(t) => setSelectedTiers((prev) => toggle(prev, t))}
        tables={selectedTables}
        onToggleTable={(t) => setSelectedTables((prev) => toggle(prev, t))}
        tableOptions={tableOptions}
        onClear={() => {
          setSelectedTiers(new Set());
          setSelectedTables(new Set());
        }}
        filteredCount={filteredCount}
        totalCount={guests.length}
        active={filterActive}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total guests" value={total} accent="navy" />
        <StatCard label="Checked in" value={checkedIn} accent="emerald" />
        <StatCard label="Pending" value={pending} accent="gray" />
        <StatCard label="Attendance" value={`${pct}%`} accent="orange" />
      </div>

      {total > 0 && (
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-aegis-gray-100">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pct}%` }}
            aria-hidden
          />
        </div>
      )}

      {/* ── Sub-tabs ────────────────────────────────────────────────
          Three categories — By company, By table, Recent activity —
          used to render stacked. The page got long and the host had
          to scroll a lot to find the section they wanted. Tabs let
          them jump straight to whichever breakdown matters and keep
          the rest hidden. */}
      <div
        role="tablist"
        aria-label="Report breakdowns"
        className="mt-6 -mx-1 flex gap-1 overflow-x-auto border-b border-aegis-gray-100 px-1"
      >
        {(
          [
            { key: 'company', label: 'By company' },
            { key: 'table', label: 'By table' },
            { key: 'activity', label: 'Recent activity' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={[
              '-mb-px shrink-0 border-b-2 px-3 py-2.5 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
              tab === key
                ? 'border-aegis-orange text-aegis-navy'
                : 'border-transparent text-aegis-gray-500 hover:text-aegis-navy',
            ].join(' ')}
          >
            {label}
            {key === 'activity' && (
              <span className="ml-1.5 text-aegis-gray-300 tabular-nums">
                {activity.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === 'company' && (
          <section>
            {byCompany.length === 0 ? (
              <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
                No guests yet.
              </p>
            ) : (
              // CSS columns flow top-to-bottom, then jump to col 2 —
              // preserves the descending-by-total reading order. Each
              // row is `break-inside-avoid` so a single firm never
              // splits across the column boundary.
              <div className="columns-1 gap-x-6 sm:columns-2">
                {byCompany.map((row) => {
                  const rowPct =
                    row.total === 0
                      ? 0
                      : Math.round((row.checkedIn / row.total) * 100);
                  return (
                    <div
                      key={row.company}
                      className="flex break-inside-avoid items-baseline justify-between gap-3 border-b border-aegis-gray-100 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate text-aegis-gray">
                        {row.company}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <span className="font-medium text-aegis-navy">
                          {row.checkedIn}
                        </span>
                        <span className="text-aegis-gray-300"> / {row.total}</span>
                        <span className="ml-2 inline-block w-9 text-right text-[11px] text-aegis-gray-500">
                          {rowPct}%
                        </span>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {tab === 'table' && byTable.length === 0 && (
          <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
            No guests assigned to tables yet.
          </p>
        )}

        {tab === 'table' && byTable.length > 0 && (
          <section>
            <div className="mb-2 flex items-center justify-between">
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
                By table
              </h4>
              <span className="text-[10px] uppercase tracking-[0.08em] text-aegis-gray-400">
                {byTable.filter((t) => t.table_number !== '__none__').length}
                {' '}
                {byTable.filter((t) => t.table_number !== '__none__').length === 1
                  ? 'table'
                  : 'tables'}
                {byTable.some((t) => t.table_number === '__none__') &&
                  ' · some unassigned'}
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {byTable.map((t) => {
                const isNone = t.table_number === '__none__';
                const allIn = !isNone && t.checkedIn === t.total && t.total > 0;
                return (
                  <div
                    key={t.table_number}
                    className={[
                      'overflow-hidden rounded-md border',
                      isNone
                        ? 'border-dashed border-aegis-gray-200 bg-aegis-gray-50/40'
                        : allIn
                          ? 'border-emerald-200 bg-emerald-50/40'
                          : 'border-aegis-gray-100 bg-white',
                    ].join(' ')}
                  >
                    <div
                      className={[
                        'flex items-center justify-between gap-2 border-b px-3 py-2',
                        isNone
                          ? 'border-aegis-gray-200 text-aegis-gray-500'
                          : 'border-aegis-gray-100',
                      ].join(' ')}
                    >
                      <p className="flex items-baseline gap-2 text-sm font-semibold text-aegis-navy">
                        {isNone ? (
                          <span className="text-aegis-gray-500">No table</span>
                        ) : (
                          <>
                            <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-aegis-gray-400">
                              Table
                            </span>
                            <span className="text-lg tabular-nums">
                              {t.table_number}
                            </span>
                          </>
                        )}
                      </p>
                      <span
                        className={[
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                          allIn
                            ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
                            : t.checkedIn > 0
                              ? 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30'
                              : 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
                        ].join(' ')}
                        title={`${t.checkedIn} of ${t.total} arrived`}
                      >
                        {t.checkedIn} / {t.total}
                      </span>
                    </div>
                    <ul className="divide-y divide-aegis-gray-100">
                      {t.guests.slice(0, 8).map((g) => (
                        <li
                          key={g.guest_id}
                          className={[
                            'flex items-center justify-between gap-2 px-3 py-1.5',
                            g.checked_in ? 'bg-emerald-50/30' : '',
                          ].join(' ')}
                        >
                          <div className="min-w-0">
                            <p
                              className={[
                                'truncate text-[13px]',
                                g.checked_in
                                  ? 'font-medium text-aegis-navy'
                                  : 'text-aegis-gray',
                              ].join(' ')}
                            >
                              {g.full_name}
                            </p>
                            {g.company && (
                              <p className="truncate text-[10px] text-aegis-gray-400">
                                {g.company}
                              </p>
                            )}
                          </div>
                          {g.checked_in ? (
                            <svg
                              className="h-3.5 w-3.5 shrink-0 text-emerald-600"
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
                          ) : (
                            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-aegis-gray-200" />
                          )}
                        </li>
                      ))}
                      {t.guests.length > 8 && (
                        <li className="px-3 py-1.5 text-[10px] text-aegis-gray-400">
                          + {t.guests.length - 8} more
                        </li>
                      )}
                    </ul>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {tab === 'activity' && (
        <section>
          {activity.length === 0 ? (
            <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
              No check-in activity yet — the audit feed shows kiosk and admin
              actions as they happen.
            </p>
          ) : (
            <ul className="divide-y divide-aegis-gray-100 rounded-md border border-aegis-gray-100">
              {activity.slice(0, 25).map((entry) => (
                <li
                  key={entry.checkin_id}
                  className="flex items-start gap-3 px-3 py-2.5"
                >
                  <ActivityIcon action={entry.action} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      <span className="font-medium text-aegis-navy">
                        {entry.guest_name ?? 'Deleted guest'}
                      </span>
                      <span className="text-aegis-gray">
                        {' '}
                        {ACTIVITY_VERB[entry.action] ?? entry.action}
                      </span>
                      {entry.performed_by_label && (
                        <span className="text-aegis-gray">
                          {' by '}
                          <span className="font-medium text-aegis-gray-700">
                            {entry.performed_by_label}
                          </span>
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-aegis-gray-500">
                      {[
                        entry.guest_company,
                        formatRelative(entry.performed_at),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>
                  <span
                    className={[
                      'inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ring-1 ring-inset',
                      entry.source === 'kiosk'
                        ? 'bg-aegis-orange-50 text-aegis-orange-600 ring-aegis-orange/30'
                        : 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
                    ].join(' ')}
                    title={`Source: ${EVENT_CHECKIN_SOURCE_LABEL[entry.source]}`}
                  >
                    {EVENT_CHECKIN_SOURCE_LABEL[entry.source]}
                  </span>
                </li>
              ))}
              {activity.length > 25 && (
                <li className="px-3 py-2 text-center text-[11px] text-aegis-gray-400">
                  + {activity.length - 25} earlier entries — download the
                  PDF / Excel report for the full log.
                </li>
              )}
            </ul>
          )}
        </section>
        )}
      </div>
    </div>
  );
}

function ActivityIcon({ action }: { action: EventCheckinAction }) {
  // Three visual buckets:
  //   • checkin              → green check (the happy path)
  //   • undo                 → grey rewind arrow (correction)
  //   • new floor actions    → navy "edit/sparkle" so they read as "host
  //                            adjustment" rather than ambient activity
  if (action === 'checkin') {
    return (
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"
        aria-hidden
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12l5 5 9-11" />
        </svg>
      </span>
    );
  }
  if (action === 'undo') {
    return (
      <span
        className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aegis-gray-100 text-aegis-gray-500"
        aria-hidden
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </span>
    );
  }
  return (
    <span
      className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-aegis-blue-50 text-aegis-navy"
      aria-hidden
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
      </svg>
    </span>
  );
}

// ─── Export filter (collapsible) ─────────────────────────────────────
//
// Tier + table checkboxes that drive the ?tiers=…&tables=… query string
// on the export links. Collapsed by default so the report tab still
// reads as one short page; expands on first interaction. Selection
// state lives in the parent so the URL stays in sync even when the
// panel is closed.

function ExportFilter({
  tiers,
  onToggleTier,
  tables,
  onToggleTable,
  tableOptions,
  onClear,
  filteredCount,
  totalCount,
  active,
}: {
  tiers: Set<GuestTier>;
  onToggleTier: (t: GuestTier) => void;
  tables: Set<string>;
  onToggleTable: (t: string) => void;
  tableOptions: string[];
  onClear: () => void;
  filteredCount: number;
  totalCount: number;
  active: boolean;
}) {
  const [open, setOpen] = useState(false);
  // Auto-expand when the user has already filtered — closing then
  // re-opening the tab shouldn't hide their active selection.
  const expanded = open || active;

  return (
    <div className="mb-4 rounded-md border border-aegis-gray-100 bg-aegis-gray-50/40 print:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M3 6h18M6 12h12M10 18h4" />
          </svg>
          Filter exports
          {active && (
            <span className="rounded-full bg-aegis-orange-50 px-1.5 py-0.5 text-[10px] font-semibold text-aegis-orange-600 ring-1 ring-inset ring-aegis-orange/30">
              {filteredCount} / {totalCount}
            </span>
          )}
        </span>
        <span className="text-[11px] text-aegis-gray-400">
          {expanded ? 'Hide' : 'Show'}
        </span>
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-aegis-gray-100 px-3 py-3">
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
              By tier
            </p>
            <div className="flex flex-wrap gap-1.5">
              {ALL_TIERS.map((t) => {
                const checked = tiers.has(t);
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onToggleTier(t)}
                    aria-pressed={checked}
                    className={[
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors',
                      checked
                        ? 'border-aegis-navy bg-aegis-navy text-white'
                        : 'border-aegis-gray-200 bg-white text-aegis-gray hover:border-aegis-navy-100',
                    ].join(' ')}
                  >
                    {checked && (
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
                    )}
                    {GUEST_TIER_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>

          {tableOptions.length > 0 && (
            <div>
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
                By table
              </p>
              <div className="flex flex-wrap gap-1.5">
                {tableOptions.map((t) => {
                  const checked = tables.has(t);
                  const label = t === NO_TABLE_SENTINEL ? 'No table' : `Table ${t}`;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => onToggleTable(t)}
                      aria-pressed={checked}
                      className={[
                        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium tabular-nums transition-colors',
                        checked
                          ? 'border-aegis-navy bg-aegis-navy text-white'
                          : 'border-aegis-gray-200 bg-white text-aegis-gray hover:border-aegis-navy-100',
                      ].join(' ')}
                    >
                      {checked && (
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
                      )}
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-aegis-gray-500">
            <span>
              {active
                ? `Exports will include ${filteredCount} of ${totalCount} guests.`
                : `No filter — exports include all ${totalCount} guests.`}
            </span>
            {active && (
              <button
                type="button"
                onClick={onClear}
                className="font-medium text-aegis-navy hover:text-aegis-orange"
              >
                Clear filter
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 3v12" />
      <path d="M7 12l5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent: 'navy' | 'emerald' | 'gray' | 'orange';
}) {
  const styles: Record<typeof accent, string> = {
    navy: 'bg-aegis-navy-50 text-aegis-navy',
    emerald: 'bg-emerald-50 text-emerald-700',
    gray: 'bg-aegis-gray-50 text-aegis-gray',
    orange: 'bg-aegis-orange-50 text-aegis-orange-600',
  };
  return (
    <div className={`rounded-lg px-4 py-3 ${styles[accent]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] opacity-70">
        {label}
      </p>
      <p className="mt-0.5 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
