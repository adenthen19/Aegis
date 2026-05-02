'use client';

import { useEffect, useSyncExternalStore } from 'react';

const STORAGE_KEY = 'aegis-density';
const HTML_ATTR = 'data-density';
const CHANGE_EVENT = 'aegis-density-change';

type Density = 'comfortable' | 'compact';

// ─────────────────────────────────────────────────────────────────────────
// External store: localStorage. We use `useSyncExternalStore` so the value
// flows from storage → render without a setState-in-effect bounce, and so
// multiple toggle buttons stay in sync if we ever drop another one in the
// UI.
// ─────────────────────────────────────────────────────────────────────────

function subscribe(cb: () => void): () => void {
  // Cross-tab storage event + same-tab custom event (browsers don't fire
  // 'storage' in the same window that wrote it).
  window.addEventListener('storage', cb);
  window.addEventListener(CHANGE_EVENT, cb);
  return () => {
    window.removeEventListener('storage', cb);
    window.removeEventListener(CHANGE_EVENT, cb);
  };
}

function getSnapshot(): Density {
  return window.localStorage.getItem(STORAGE_KEY) === 'compact'
    ? 'compact'
    : 'comfortable';
}

function getServerSnapshot(): Density {
  return 'comfortable';
}

// Toggles a global `data-density` attribute on the <html> element so the
// CSS in globals.css can compress data-table padding without every table
// having to opt-in via a prop.
export default function DensityToggle({
  className,
}: {
  className?: string;
}) {
  const density = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Push the current density onto the document root so CSS rules under
  // `[data-density="compact"]` activate. Side-effect-only — no setState.
  useEffect(() => {
    document.documentElement.setAttribute(HTML_ATTR, density);
  }, [density]);

  function toggle() {
    const next: Density = density === 'compact' ? 'comfortable' : 'compact';
    window.localStorage.setItem(STORAGE_KEY, next);
    // Notify same-tab subscribers (the storage event only fires across tabs).
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  const isCompact = density === 'compact';

  return (
    <button
      type="button"
      onClick={toggle}
      title={isCompact ? 'Switch to comfortable rows' : 'Switch to compact rows'}
      aria-label={isCompact ? 'Use comfortable density' : 'Use compact density'}
      aria-pressed={isCompact}
      className={[
        'aegis-press inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-aegis-blue-100/60 transition-colors hover:bg-aegis-navy-700/40 hover:text-white',
        className ?? '',
      ].join(' ')}
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {isCompact ? (
          <>
            <path d="M3 6h18" />
            <path d="M3 10h18" />
            <path d="M3 14h18" />
            <path d="M3 18h18" />
          </>
        ) : (
          <>
            <path d="M3 6h18" />
            <path d="M3 12h18" />
            <path d="M3 18h18" />
          </>
        )}
      </svg>
      {isCompact ? 'Compact' : 'Comfortable'}
    </button>
  );
}
