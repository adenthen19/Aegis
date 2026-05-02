'use client';

import { useLinkStatus } from 'next/link';

// Inline pending indicator for sidebar / nav <Link>s. Renders an empty
// fixed-width slot by default (so nothing shifts on click) and fades a
// small spinner in if navigation takes more than ~120 ms — meaning fast,
// prefetched routes don't flash a confirmation no one needed.
//
// Has to live inside a <Link> (Next.js useLinkStatus contract).
export default function LinkPendingSpinner({
  className,
}: {
  className?: string;
}) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      data-pending={pending ? 'true' : 'false'}
      className={[
        // Fixed slot so the layout never jumps when the spinner appears.
        'pointer-events-none ml-auto inline-flex h-3.5 w-3.5 items-center justify-center',
        // Custom CSS class wires up the delayed fade-in animation. Defined
        // in globals.css; CSS-only so it survives a re-render without
        // restarting.
        'link-pending-slot',
        className ?? '',
      ].join(' ')}
    >
      <span className="link-pending-dot h-3 w-3 rounded-full border-2 border-current border-t-transparent" />
    </span>
  );
}
