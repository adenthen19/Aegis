'use client';

import { useState } from 'react';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { deleteTodoAction } from './actions';

export default function TodoRowActions({ actionItemId }: { actionItemId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        title="Delete to-do"
        aria-label="Delete to-do"
        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
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
          <path d="M3 6h18" />
          <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
        </svg>
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteTodoAction(actionItemId)}
        title="Delete to-do?"
        description="This will permanently delete this to-do."
        confirmLabel="Delete"
        destructive
      />
    </>
  );
}
