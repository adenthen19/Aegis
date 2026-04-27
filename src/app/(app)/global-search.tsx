'use client';

/**
 * Global search box. Lives in the sidebar so it's reachable from every page.
 * Submits to /search?q=… as a GET request — the page does its own grouped
 * lookups server-side. We don't do client-side autocomplete because the
 * dataset is small enough that a single round-trip with a 6-table parallel
 * query stays under 100ms in practice.
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function GlobalSearch({
  onSubmit,
}: {
  // Optional callback so the parent can close a mobile drawer after submit.
  onSubmit?: () => void;
}) {
  const router = useRouter();
  const [q, setQ] = useState('');

  function go(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = q.trim();
    if (trimmed.length < 2) return;
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    onSubmit?.();
  }

  return (
    <form onSubmit={go} role="search" className="px-3">
      <label htmlFor="global-search" className="sr-only">
        Search the workspace
      </label>
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-2.5 flex items-center text-aegis-blue-100/40"
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
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        </span>
        <input
          id="global-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search…"
          className="w-full rounded-md border border-aegis-navy-700/60 bg-aegis-navy-700/40 py-1.5 pl-8 pr-2 text-xs text-white placeholder:text-aegis-blue-100/40 outline-none focus:border-aegis-orange/60 focus:bg-aegis-navy-700/70"
        />
      </div>
    </form>
  );
}
