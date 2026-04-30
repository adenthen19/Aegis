'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { FormActions, FormError } from '@/components/ui/form';
import {
  INTERVIEW_FORMAT_LABEL,
  INTERVIEW_STATUS_LABEL,
  type InterviewStatus,
  type MediaInterview,
} from '@/lib/types';
import {
  createMediaInterviewAction,
  deleteMediaInterviewAction,
  setMediaInterviewStatusAction,
  updateMediaInterviewAction,
  type ActionState,
} from '../media-interviews-actions';
import MediaInterviewFormFields from './media-interview-form-fields';

type MediaContactRef = {
  media_id: string;
  full_name: string;
  company_name: string | null;
};

type CoverageRef = {
  coverage_id: string;
  headline: string;
  publication_date: string;
};

const STATUS_BADGE: Record<InterviewStatus, string> = {
  scheduled: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  postponed: 'bg-amber-50 text-amber-700 ring-amber-200',
};

const STATUS_OPTIONS: InterviewStatus[] = [
  'scheduled',
  'completed',
  'cancelled',
  'postponed',
];

const initialState: ActionState = { ok: false, error: null };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function outletLabel(
  row: MediaInterview,
  mediaContacts: MediaContactRef[],
): string {
  if (row.media_id) {
    const c = mediaContacts.find((m) => m.media_id === row.media_id);
    if (c) {
      return c.company_name ? `${c.full_name} · ${c.company_name}` : c.full_name;
    }
  }
  return row.publication_name ?? '—';
}

export default function MediaInterviewsSection({
  clientId,
  interviews,
  mediaContacts,
  interviewCommitments,
  coverageOptions,
}: {
  clientId: string;
  interviews: MediaInterview[];
  mediaContacts: MediaContactRef[];
  interviewCommitments: { client_deliverable_id: string; label: string }[];
  coverageOptions: CoverageRef[];
}) {
  const [newOpen, setNewOpen] = useState(false);

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
        >
          + New interview
        </button>
      </div>

      {interviews.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
          No interviews logged yet. Schedule one to start tracking media engagements.
        </p>
      ) : (
        <ul className="space-y-2">
          {interviews.map((row) => (
            <InterviewRow
              key={row.interview_id}
              row={row}
              clientId={clientId}
              mediaContacts={mediaContacts}
              interviewCommitments={interviewCommitments}
              coverageOptions={coverageOptions}
            />
          ))}
        </ul>
      )}

      <NewInterviewModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        clientId={clientId}
        mediaContacts={mediaContacts}
        interviewCommitments={interviewCommitments}
        coverageOptions={coverageOptions}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Row
// ─────────────────────────────────────────────────────────────────────────

function InterviewRow({
  row,
  clientId,
  mediaContacts,
  interviewCommitments,
  coverageOptions,
}: {
  row: MediaInterview;
  clientId: string;
  mediaContacts: MediaContactRef[];
  interviewCommitments: { client_deliverable_id: string; label: string }[];
  coverageOptions: CoverageRef[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSetStatus(next: InterviewStatus) {
    startTransition(async () => {
      setError(null);
      const r = await setMediaInterviewStatusAction(row.interview_id, next);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="rounded-md border border-aegis-gray-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-aegis-navy">
              {outletLabel(row, mediaContacts)}
            </span>
            <span
              className={[
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                STATUS_BADGE[row.status],
              ].join(' ')}
            >
              {INTERVIEW_STATUS_LABEL[row.status]}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
              {INTERVIEW_FORMAT_LABEL[row.interview_format]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
            <span className="tabular-nums">{formatDateTime(row.interview_date)}</span>
            {row.reporter_name && <span>· {row.reporter_name}</span>}
            {row.spokesperson_name && (
              <span>· Spokesperson: {row.spokesperson_name}</span>
            )}
            {row.expected_publish_date && (
              <span>· Expect publish: {formatDate(row.expected_publish_date)}</span>
            )}
            {row.coverage_id && (
              <span className="text-emerald-700">· Coverage linked</span>
            )}
          </div>
          {row.topic && (
            <p className="mt-1 text-[12px] text-aegis-gray">
              <span className="text-aegis-gray-500">Topic: </span>
              {row.topic}
            </p>
          )}
          {row.notes && (
            <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-[12px] text-aegis-gray-500">
              {row.notes}
            </p>
          )}
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={row.status}
            onChange={(e) => onSetStatus(e.target.value as InterviewStatus)}
            disabled={pending}
            className="rounded-md border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {INTERVIEW_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            title="Edit"
            aria-label="Edit"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-aegis-gray-500 hover:bg-aegis-navy-50 hover:text-aegis-navy"
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
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            title="Delete"
            aria-label="Delete"
            className="inline-flex h-7 w-7 items-center justify-center rounded text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
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
            </svg>
          </button>
        </div>
      </div>

      <EditInterviewModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        row={row}
        clientId={clientId}
        mediaContacts={mediaContacts}
        interviewCommitments={interviewCommitments}
        coverageOptions={coverageOptions}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteMediaInterviewAction(row.interview_id)}
        title="Delete interview?"
        description="Removes this interview record. If it was completed and linked to a commitment, the counter is decremented."
        confirmLabel="Delete"
        destructive
      />
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────

function NewInterviewModal({
  open,
  onClose,
  clientId,
  mediaContacts,
  interviewCommitments,
  coverageOptions,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  mediaContacts: MediaContactRef[];
  interviewCommitments: { client_deliverable_id: string; label: string }[];
  coverageOptions: CoverageRef[];
}) {
  const [state, action] = useActionState(createMediaInterviewAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New media interview"
      description="Log a one-on-one between a client spokesperson and a journalist."
      size="2xl"
    >
      <form action={action} className="space-y-4">
        <MediaInterviewFormFields
          clientId={clientId}
          mediaContacts={mediaContacts}
          interviewCommitments={interviewCommitments}
          coverageOptions={coverageOptions}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditInterviewModal({
  open,
  onClose,
  row,
  clientId,
  mediaContacts,
  interviewCommitments,
  coverageOptions,
}: {
  open: boolean;
  onClose: () => void;
  row: MediaInterview;
  clientId: string;
  mediaContacts: MediaContactRef[];
  interviewCommitments: { client_deliverable_id: string; label: string }[];
  coverageOptions: CoverageRef[];
}) {
  const [state, action] = useActionState(updateMediaInterviewAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit interview" size="2xl">
      <form action={action} className="space-y-4">
        <MediaInterviewFormFields
          initial={row}
          clientId={clientId}
          mediaContacts={mediaContacts}
          interviewCommitments={interviewCommitments}
          coverageOptions={coverageOptions}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
