'use client';

import { useTransition } from 'react';
import { toggleActionItemAction } from './actions';
import type { ActionItemStatus } from '@/lib/types';

export default function ActionItemToggle({
  actionItemId,
  status,
}: {
  actionItemId: string;
  status: ActionItemStatus;
}) {
  const [pending, startTransition] = useTransition();
  const isDone = status === 'done';

  function onToggle() {
    startTransition(async () => {
      await toggleActionItemAction(actionItemId, isDone ? 'open' : 'done');
    });
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={pending}
      title={isDone ? 'Mark open' : 'Mark done'}
      aria-label={isDone ? 'Mark open' : 'Mark done'}
      className={[
        'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors',
        isDone
          ? 'border-aegis-navy bg-aegis-navy text-white'
          : 'border-aegis-gray-300 bg-white text-transparent hover:border-aegis-navy',
        pending ? 'opacity-50' : '',
      ].join(' ')}
    >
      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12l5 5L20 7" />
      </svg>
    </button>
  );
}
