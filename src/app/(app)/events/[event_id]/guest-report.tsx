'use client';

import { useMemo } from 'react';
import type { CheckinFeedEntry } from './page';
import {
  EVENT_CHECKIN_SOURCE_LABEL,
  type EventGuest,
} from '@/lib/types';
import PushToSheetButton from './push-to-sheet-button';

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
  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;
  const pending = total - checkedIn;
  const pct = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

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
            href={`/api/events/${eventId}/attendance/pdf`}
            className="inline-flex items-center gap-1.5 rounded-md bg-aegis-orange px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-aegis-orange-600"
            title="Branded PDF report — designed for sharing with the client."
          >
            <DownloadIcon />
            PDF report
          </a>
          <a
            href={`/api/events/${eventId}/attendance/xlsx`}
            className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100"
            title="Formatted Excel workbook with Summary + Guest List sheets."
          >
            <DownloadIcon />
            Excel
          </a>
          <a
            href={`/api/events/${eventId}/attendance`}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray hover:bg-aegis-gray-50"
            title="Raw CSV — handy for spreadsheet imports."
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

      <div className="mt-6 grid gap-5 lg:grid-cols-2">
        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
            By company
          </h4>
          {byCompany.length === 0 ? (
            <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
              No guests yet.
            </p>
          ) : (
            <div className="overflow-hidden rounded-md border border-aegis-gray-100">
              <table className="w-full text-left text-sm">
                <thead className="bg-aegis-gray-50/60 text-[10px] uppercase tracking-[0.08em] text-aegis-gray-500">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Company</th>
                    <th className="px-3 py-2 text-right font-semibold">In / total</th>
                    <th className="px-3 py-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-aegis-gray-100">
                  {byCompany.map((row) => {
                    const rowPct =
                      row.total === 0
                        ? 0
                        : Math.round((row.checkedIn / row.total) * 100);
                    return (
                      <tr key={row.company}>
                        <td className="px-3 py-2 text-aegis-gray">{row.company}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-aegis-gray">
                          <span className="font-medium text-aegis-navy">
                            {row.checkedIn}
                          </span>
                          <span className="text-aegis-gray-300"> / {row.total}</span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-aegis-gray-500">
                          {rowPct}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {byTable.length > 0 && (
          <section className="lg:col-span-2">
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

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
              Recent activity
            </h4>
            <span className="text-[10px] uppercase tracking-[0.08em] text-aegis-gray-400">
              {activity.length} entr{activity.length === 1 ? 'y' : 'ies'}
            </span>
          </div>
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
                        {entry.action === 'checkin'
                          ? ' checked in'
                          : ' un-checked'}
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
      </div>
    </div>
  );
}

function ActivityIcon({ action }: { action: 'checkin' | 'undo' }) {
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
