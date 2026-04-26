'use client';

import { useState } from 'react';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import EditTemplate from './edit-template';
import { deleteDeliverableTemplateAction } from './actions';
import type { DeliverableTemplate } from '@/lib/types';

export default function TemplateRowActions({ row }: { row: DeliverableTemplate }) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => setEditOpen(true)}
        title="Edit"
        aria-label="Edit"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-aegis-gray-500 hover:bg-aegis-navy-50 hover:text-aegis-navy"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        title="Delete"
        aria-label="Delete"
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-aegis-gray-500 hover:bg-red-50 hover:text-red-600"
      >
        <svg
          className="h-4 w-4"
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

      <EditTemplate row={row} open={editOpen} onClose={() => setEditOpen(false)} />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteDeliverableTemplateAction(row.template_id)}
        title="Delete template?"
        description="This will not affect deliverables already seeded into clients — they snapshot the label and target at seed time."
        confirmLabel="Delete template"
        destructive
      />
    </div>
  );
}
