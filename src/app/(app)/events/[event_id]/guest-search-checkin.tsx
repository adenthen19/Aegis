'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { EventGuest } from '@/lib/types';

// Search rules:
// • If the query contains any letter — treat as name/company/email lookup,
//   require at least 2 characters before showing results.
// • If the query is digits-only (with optional spaces, +, -, parens) —
//   treat as phone lookup, require at least 4 digits before showing results.
// This matches the "key in at least 4 digits" UX the user asked for at the
// front-of-house check-in kiosk.

function classifyQuery(raw: string): {
  ready: boolean;
  hint: string | null;
  isPhone: boolean;
  digits: string;
  text: string;
} {
  const term = raw.trim();
  if (!term) {
    return { ready: false, hint: null, isPhone: false, digits: '', text: '' };
  }
  const hasLetter = /[a-zA-Z]/.test(term);
  const digits = term.replace(/\D/g, '');
  if (!hasLetter) {
    if (digits.length < 4) {
      return {
        ready: false,
        hint: `Keep typing — ${4 - digits.length} more digit${4 - digits.length === 1 ? '' : 's'} needed.`,
        isPhone: true,
        digits,
        text: term,
      };
    }
    return { ready: true, hint: null, isPhone: true, digits, text: term };
  }
  if (term.length < 2) {
    return {
      ready: false,
      hint: 'Keep typing — at least 2 characters.',
      isPhone: false,
      digits,
      text: term,
    };
  }
  return { ready: true, hint: null, isPhone: false, digits, text: term };
}

function matches(guest: EventGuest, q: ReturnType<typeof classifyQuery>): boolean {
  if (q.isPhone) {
    const guestDigits = (guest.contact_number ?? '').replace(/\D/g, '');
    if (!guestDigits) return false;
    return guestDigits.includes(q.digits);
  }
  const term = q.text.toLowerCase();
  return (
    guest.full_name.toLowerCase().includes(term) ||
    (guest.title?.toLowerCase().includes(term) ?? false) ||
    (guest.company?.toLowerCase().includes(term) ?? false) ||
    (guest.email?.toLowerCase().includes(term) ?? false)
  );
}

export default function GuestSearchCheckin({
  guests,
  onPick,
}: {
  guests: EventGuest[];
  onPick: (guest: EventGuest) => void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount + whenever the user clicks "Clear" so the kiosk is
  // immediately ready for the next guest.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const classified = useMemo(() => classifyQuery(query), [query]);
  const results = useMemo(() => {
    if (!classified.ready) return [];
    return guests.filter((g) => matches(g, classified)).slice(0, 50);
  }, [guests, classified]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Enter behaviour: if there's a single match, jump straight to its
    // detail modal — the typical "I scanned a name and it's the only one"
    // flow. Multiple matches → ignore Enter (user must click).
    if (results.length === 1) {
      onPick(results[0]);
      setQuery('');
    }
  }

  return (
    <div className="px-4 py-4 sm:px-5">
      <form onSubmit={onSubmit}>
        <label htmlFor="guest-kiosk-search" className="sr-only">
          Search guest
        </label>
        <div className="relative">
          <svg
            className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-aegis-gray-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            id="guest-kiosk-search"
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type name, company, or contact number (4+ digits)"
            autoComplete="off"
            className="w-full rounded-lg border border-aegis-gray-200 bg-white py-3.5 pl-12 pr-4 text-base text-aegis-gray-900 shadow-sm outline-none placeholder:text-aegis-gray-300 focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => {
                setQuery('');
                inputRef.current?.focus();
              }}
              className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-aegis-gray-300 hover:bg-aegis-gray-50 hover:text-aegis-gray"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                aria-hidden
              >
                <path d="M6 6l12 12M6 18L18 6" />
              </svg>
            </button>
          )}
        </div>
      </form>

      <p className="mt-2 text-[11px] text-aegis-gray-500">
        {classified.hint
          ? classified.hint
          : classified.ready
            ? `${results.length} match${results.length === 1 ? '' : 'es'}${
                results.length === 1 ? ' — press Enter to open' : ''
              }`
            : 'Type at least 2 letters, or 4 digits for a phone lookup.'}
      </p>

      {classified.ready && (
        <div className="mt-4">
          {results.length === 0 ? (
            <div className="rounded-lg border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-10 text-center text-sm text-aegis-gray-500">
              No guest found for &ldquo;{query.trim()}&rdquo;.
            </div>
          ) : (
            <ul className="divide-y divide-aegis-gray-100 rounded-lg border border-aegis-gray-100">
              {results.map((g) => (
                <li key={g.guest_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(g);
                      setQuery('');
                      inputRef.current?.focus();
                    }}
                    className={[
                      'flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors',
                      g.checked_in
                        ? 'bg-emerald-50/40 hover:bg-emerald-50'
                        : 'hover:bg-aegis-navy-50/40',
                    ].join(' ')}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-aegis-navy">
                        {highlight(g.full_name, classified)}
                      </p>
                      <p className="text-[11px] text-aegis-gray-500">
                        {[g.title, g.company].filter(Boolean).join(' · ') || '—'}
                        {g.contact_number && (
                          <>
                            {' · '}
                            {classified.isPhone
                              ? highlight(g.contact_number, classified)
                              : g.contact_number}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={[
                          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                          g.checked_in
                            ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                            : 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
                        ].join(' ')}
                      >
                        {g.checked_in ? 'Checked in' : 'Pending'}
                      </span>
                      {g.table_number && (
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
                          {g.table_number}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Cheap term highlighter — wraps the matched substring in a <mark>. For phone
// queries we highlight the digit run inside the formatted number; for text we
// highlight the literal substring (case-insensitive).
function highlight(value: string, q: ReturnType<typeof classifyQuery>): React.ReactNode {
  if (q.isPhone) {
    // Walk the original string, marking any run whose digit-only projection
    // contains the query digits. Simpler alt: mark the first window of
    // characters that consume q.digits.length digits starting from the first
    // matching digit position.
    const valueDigits = value.replace(/\D/g, '');
    const idx = valueDigits.indexOf(q.digits);
    if (idx === -1) return value;
    let consumed = 0;
    let start = -1;
    let end = -1;
    for (let i = 0; i < value.length; i++) {
      if (/\d/.test(value[i])) {
        if (consumed === idx && start === -1) start = i;
        if (consumed === idx + q.digits.length - 1) {
          end = i + 1;
          break;
        }
        consumed += 1;
      }
    }
    if (start === -1 || end === -1) return value;
    return (
      <>
        {value.slice(0, start)}
        <mark className="rounded bg-aegis-orange/20 px-0.5 text-aegis-navy">
          {value.slice(start, end)}
        </mark>
        {value.slice(end)}
      </>
    );
  }
  const lower = value.toLowerCase();
  const idx = lower.indexOf(q.text.toLowerCase());
  if (idx === -1) return value;
  return (
    <>
      {value.slice(0, idx)}
      <mark className="rounded bg-aegis-orange/20 px-0.5 text-aegis-navy">
        {value.slice(idx, idx + q.text.length)}
      </mark>
      {value.slice(idx + q.text.length)}
    </>
  );
}
