'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { SortState } from './data-table';

export default function SortableHeader({
  label, sortKey, sortState,
}: { label: string; sortKey: string; sortState?: SortState }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const isActive = sortState?.sort === sortKey;
  const nextDir: 'asc' | 'desc' = isActive && sortState?.dir === 'asc' ? 'desc' : 'asc';

  const params = new URLSearchParams(Array.from(searchParams.entries()));
  params.set('sort', sortKey);
  params.set('dir', nextDir);
  params.delete('page');
  const href = `${pathname}?${params.toString()}`;

  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 transition-colors hover:text-aegis-navy"
    >
      {label}
      <span className="text-aegis-gray-300">
        {isActive ? (
          sortState?.dir === 'asc' ? (
            <Arrow up />
          ) : (
            <Arrow />
          )
        ) : (
          <Updown />
        )}
      </span>
    </Link>
  );
}

function Arrow({ up }: { up?: boolean }) {
  return (
    <svg
      className={`h-3 w-3 text-aegis-navy ${up ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function Updown() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M8 9l4-4 4 4" />
      <path d="M16 15l-4 4-4-4" />
    </svg>
  );
}
