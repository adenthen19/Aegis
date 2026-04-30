'use client';

import type { EventGuest } from '@/lib/types';

export default function GuestListView({
  guests,
  onPick,
}: {
  guests: EventGuest[];
  onPick: (guest: EventGuest) => void;
}) {
  if (guests.length === 0) {
    return (
      <p className="px-5 py-12 text-center text-sm text-aegis-gray-500">
        No guests yet — add one or import a CSV.
      </p>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-aegis-gray-100 bg-aegis-gray-50/60">
              <Th>Name</Th>
              <Th>Title</Th>
              <Th>Company</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-aegis-gray-100">
            {guests.map((g) => (
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
                  <StatusPill checkedIn={g.checked_in} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-aegis-gray-100 sm:hidden">
        {guests.map((g) => (
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
              <StatusPill checkedIn={g.checked_in} />
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
