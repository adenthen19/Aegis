'use client';

/**
 * Inline PIC picker for an action item. Opens a small popover with the team
 * roster + an "Unassigned" option. Selection fires the reassign action and
 * reloads the section once it returns.
 *
 * Used both on the My To-Do page (where reassigning makes the row vanish
 * from the user's own queue) and on the client profile open-todos list
 * (where the row stays but the PIC label updates).
 */

import { useEffect, useRef, useState, useTransition } from 'react';
import type { Profile } from '@/lib/types';
import { reassignTodoAction } from './actions';

function profileLabel(p: Profile): string {
  return (p.display_name && p.display_name.trim()) || p.email;
}

function profileInitial(p: Profile): string {
  return profileLabel(p).charAt(0).toUpperCase();
}

export default function ReassignTodo({
  actionItemId,
  currentPicUserId,
  profiles,
}: {
  actionItemId: string;
  currentPicUserId: string | null;
  profiles: Profile[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside dismiss.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  function reassign(nextPic: string | null) {
    setOpen(false);
    startTransition(async () => {
      setError(null);
      const r = await reassignTodoAction(actionItemId, nextPic);
      if (!r.ok) setError(r.error);
    });
  }

  const sorted = [...profiles].sort((a, b) =>
    profileLabel(a).localeCompare(profileLabel(b)),
  );

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
        title="Reassign"
        aria-label="Reassign"
        className="inline-flex h-6 w-6 items-center justify-center rounded text-aegis-gray-300 hover:bg-aegis-navy-50 hover:text-aegis-navy disabled:opacity-50"
      >
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
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6" />
          <path d="M23 11h-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-md border border-aegis-gray-100 bg-white shadow-lg">
          <ul className="py-1 text-sm">
            <li>
              <button
                type="button"
                onClick={() => reassign(null)}
                className={[
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-aegis-gray-50',
                  currentPicUserId == null
                    ? 'font-medium text-aegis-navy'
                    : 'text-aegis-gray',
                ].join(' ')}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-aegis-gray-100 text-[10px] font-semibold text-aegis-gray-500">
                  ?
                </span>
                Unassigned
              </button>
            </li>
            <li className="border-t border-aegis-gray-100" />
            {sorted.map((p) => {
              const isCurrent = p.user_id === currentPicUserId;
              return (
                <li key={p.user_id}>
                  <button
                    type="button"
                    onClick={() => reassign(p.user_id)}
                    className={[
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-aegis-gray-50',
                      isCurrent ? 'bg-aegis-blue-50/40 font-medium text-aegis-navy' : 'text-aegis-gray',
                    ].join(' ')}
                  >
                    {p.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={p.avatar_url}
                        alt=""
                        className="h-5 w-5 rounded-full object-cover"
                      />
                    ) : (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-aegis-blue-50 text-[10px] font-semibold text-aegis-navy">
                        {profileInitial(p)}
                      </span>
                    )}
                    <span className="flex-1 truncate">{profileLabel(p)}</span>
                    {isCurrent && (
                      <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
                        current
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
