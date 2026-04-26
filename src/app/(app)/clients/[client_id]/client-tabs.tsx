'use client';

import { useState } from 'react';

export type ClientTabKey =
  | 'overview'
  | 'engagements'
  | 'press'
  | 'todos'
  | 'documents';

const TABS: { key: ClientTabKey; label: string; count?: number }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'press', label: 'Press & coverage' },
  { key: 'todos', label: 'To-dos & meetings' },
  { key: 'documents', label: 'Documents' },
];

/**
 * Client-side tab nav for the client detail page. State is held in JS rather
 * than the URL because every tab is already rendered and just toggled with
 * CSS, so switching is instant and shareable links to a specific tab aren't
 * critical for an internal CRM. If we later want deep-link support we can
 * promote this to searchParams.
 */
export default function ClientTabs({
  counts,
  children,
}: {
  counts: Partial<Record<ClientTabKey, number>>;
  children: Record<ClientTabKey, React.ReactNode>;
}) {
  const [active, setActive] = useState<ClientTabKey>('overview');

  return (
    <>
      <div className="mb-6 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex min-w-max gap-1 border-b border-aegis-gray-100">
          {TABS.map((t) => {
            const isActive = active === t.key;
            const c = counts[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActive(t.key)}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'group relative whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-aegis-orange text-aegis-navy'
                    : 'border-transparent text-aegis-gray-500 hover:border-aegis-gray-200 hover:text-aegis-gray',
                ].join(' ')}
              >
                {t.label}
                {c != null && c > 0 && (
                  <span
                    className={[
                      'ml-2 inline-flex min-w-[1.25rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                      isActive
                        ? 'bg-aegis-orange-50 text-aegis-orange-600'
                        : 'bg-aegis-gray-100 text-aegis-gray-500',
                    ].join(' ')}
                  >
                    {c}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Each panel is rendered into the DOM and toggled with hidden so server
          data is always fresh per request, and tab switching is instant. */}
      <div role="tabpanel" aria-hidden={active !== 'overview'} hidden={active !== 'overview'}>
        {children.overview}
      </div>
      <div role="tabpanel" aria-hidden={active !== 'engagements'} hidden={active !== 'engagements'}>
        {children.engagements}
      </div>
      <div role="tabpanel" aria-hidden={active !== 'press'} hidden={active !== 'press'}>
        {children.press}
      </div>
      <div role="tabpanel" aria-hidden={active !== 'todos'} hidden={active !== 'todos'}>
        {children.todos}
      </div>
      <div role="tabpanel" aria-hidden={active !== 'documents'} hidden={active !== 'documents'}>
        {children.documents}
      </div>
    </>
  );
}
