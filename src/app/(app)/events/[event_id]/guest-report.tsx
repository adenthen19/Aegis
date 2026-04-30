'use client';

import { useMemo } from 'react';
import type { EventGuest } from '@/lib/types';

function formatDateTime(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default function GuestReport({
  eventId,
  eventName,
  guests,
}: {
  eventId: string;
  eventName: string;
  guests: EventGuest[];
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

  // Recent check-ins — last 10, newest first.
  const recent = useMemo(() => {
    return guests
      .filter((g) => g.checked_in && g.checked_in_at)
      .sort(
        (a, b) =>
          new Date(b.checked_in_at!).getTime() - new Date(a.checked_in_at!).getTime(),
      )
      .slice(0, 10);
  }, [guests]);

  return (
    <div className="px-4 py-5 sm:px-5">
      <div className="mb-2 flex items-center justify-between print:hidden">
        <p className="text-[11px] uppercase tracking-[0.08em] text-aegis-gray-500">
          Attendance report — {eventName}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
          >
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
              <path d="M6 9V2h12v7" />
              <rect x="6" y="14" width="12" height="8" />
              <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            </svg>
            Print report
          </button>
          <a
            href={`/api/events/${eventId}/attendance`}
            className="inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
          >
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
            Download CSV
          </a>
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

        <section>
          <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-aegis-gray-500">
            Recent check-ins
          </h4>
          {recent.length === 0 ? (
            <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
              No one checked in yet.
            </p>
          ) : (
            <ul className="divide-y divide-aegis-gray-100 rounded-md border border-aegis-gray-100">
              {recent.map((g) => (
                <li key={g.guest_id} className="flex items-center justify-between gap-3 px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-aegis-navy">
                      {g.full_name}
                    </p>
                    {g.company && (
                      <p className="truncate text-[11px] text-aegis-gray-500">
                        {g.company}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-aegis-gray-500">
                    {formatDateTime(g.checked_in_at)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
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
