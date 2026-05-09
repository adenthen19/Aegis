'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Sub-tabs under the event detail header. Two views:
//   • Overview — event metadata + the guest list (with check-in tools)
//   • Seating  — the table list + floor plan canvas
//
// Pulled out as a client component so we can read the active route
// without making the whole layout client-side.
export default function EventSubtabs({ eventId }: { eventId: string }) {
  const pathname = usePathname();
  const overviewHref = `/events/${eventId}`;
  const seatingHref = `/events/${eventId}/seating`;
  // /events/[id] is the overview; anything under /seating is the seating
  // view. We also let exact-match on /seating handle deeper nested
  // routes if they're added later.
  const isOverview = pathname === overviewHref;
  const isSeating = pathname === seatingHref || pathname.startsWith(`${seatingHref}/`);

  return (
    <nav
      role="tablist"
      aria-label="Event sections"
      className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-aegis-gray-100 px-1"
    >
      <Tab href={overviewHref} active={isOverview} label="Overview" />
      <Tab href={seatingHref} active={isSeating} label="Seating" />
    </nav>
  );
}

function Tab({
  href,
  active,
  label,
}: {
  href: string;
  active: boolean;
  label: string;
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      // -mb-px so the active border-b sits over the parent's bottom
      // rule — matches the existing GuestList tab style for visual
      // consistency.
      className={[
        '-mb-px border-b-2 px-3 py-2.5 text-xs font-medium uppercase tracking-[0.06em] transition-colors',
        active
          ? 'border-aegis-orange text-aegis-navy'
          : 'border-transparent text-aegis-gray-500 hover:text-aegis-navy',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
