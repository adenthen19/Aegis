'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export default function Pagination({
  total, page, pageSize,
}: { total: number; page: number; pageSize: number }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const hasPrev = page > 1;
  const hasNext = page < totalPages;

  function hrefFor(p: number): string {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (p <= 1) params.delete('page');
    else params.set('page', String(p));
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  if (total === 0) return null;

  return (
    <nav
      aria-label="Pagination"
      className="mt-4 flex flex-col items-center justify-between gap-3 border-t border-aegis-gray-100 pt-4 sm:flex-row"
    >
      <p className="text-xs tabular-nums text-aegis-gray-500">
        Showing <span className="font-medium text-aegis-gray">{start}</span>–
        <span className="font-medium text-aegis-gray">{end}</span> of{' '}
        <span className="font-medium text-aegis-gray">{total}</span>
      </p>
      <div className="flex items-center gap-1">
        <PageLink href={hrefFor(page - 1)} disabled={!hasPrev} label="Previous">
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="hidden sm:inline">Previous</span>
        </PageLink>
        <span className="px-3 text-xs tabular-nums text-aegis-gray-500">
          Page <span className="font-medium text-aegis-gray">{page}</span> / {totalPages}
        </span>
        <PageLink href={hrefFor(page + 1)} disabled={!hasNext} label="Next">
          <span className="hidden sm:inline">Next</span>
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </PageLink>
      </div>
    </nav>
  );
}

function PageLink({
  href, disabled, label, children,
}: { href: string; disabled: boolean; label: string; children: React.ReactNode }) {
  const cls =
    'inline-flex items-center gap-1.5 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-gray transition-colors';
  if (disabled) {
    return (
      <span aria-disabled className={`${cls} cursor-not-allowed opacity-40`} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <Link href={href} className={`${cls} hover:border-aegis-navy/30 hover:bg-aegis-navy-50/40 hover:text-aegis-navy`} aria-label={label}>
      {children}
    </Link>
  );
}
