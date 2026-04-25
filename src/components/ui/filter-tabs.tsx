'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

export default function FilterTabs({
  paramName,
  options,
}: {
  paramName: string;
  options: { value: string; label: string }[];
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get(paramName) ?? '';

  function hrefFor(value: string): string {
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    if (value) params.set(paramName, value);
    else params.delete(paramName);
    params.delete('page');
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  return (
    <div className="flex flex-wrap items-center gap-1 rounded-md border border-aegis-gray-200 bg-white p-1">
      {options.map((o) => {
        const isActive = active === o.value;
        return (
          <Link
            key={o.value}
            href={hrefFor(o.value)}
            className={[
              'rounded px-3 py-1 text-xs font-medium transition-colors',
              isActive ? 'bg-aegis-navy text-white' : 'text-aegis-gray hover:bg-aegis-gray-50',
            ].join(' ')}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
