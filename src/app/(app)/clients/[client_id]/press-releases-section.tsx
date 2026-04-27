'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import { FormActions, FormError } from '@/components/ui/form';
import {
  COVERAGE_SENTIMENT_LABEL,
  COVERAGE_TYPE_LABEL,
  PRESS_RELEASE_STATUS_LABEL,
  PRESS_RELEASE_TYPE_LABEL,
  type Document,
  type MediaCoverage,
  type PressRelease,
  type PressReleaseStatus,
} from '@/lib/types';
import {
  type ActionState,
  createPressReleaseAction,
  deletePressReleaseAction,
  setPressReleaseStatusAction,
  updatePressReleaseAction,
} from '../press-releases-actions';
import {
  createCoverageAction,
  deleteCoverageAction,
  updateCoverageAction,
} from '../coverage-actions';
import { getDocumentDownloadUrlAction } from '../documents-actions';
import PressReleaseFormFields from './press-release-form-fields';
import CoverageFormFields from './coverage-form-fields';

type MediaContactRef = {
  media_id: string;
  full_name: string;
  company_name: string | null;
};

type CoverageRow = MediaCoverage;

const STATUS_BADGE: Record<PressReleaseStatus, string> = {
  draft: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
  approved: 'bg-amber-50 text-amber-700 ring-amber-200',
  distributed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  archived: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200',
};

const SENTIMENT_BADGE = {
  positive: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  neutral: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
  negative: 'bg-red-50 text-red-700 ring-red-200',
};

const STATUS_OPTIONS: PressReleaseStatus[] = [
  'draft',
  'approved',
  'distributed',
  'archived',
];

const initialState: ActionState = { ok: false, error: null };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatNumber(n: number | null): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

export default function PressReleasesSection({
  clientId,
  pressReleases,
  coverageByPress,
  unlinkedCoverage,
  clippingsByCoverage,
  pressReleaseCommitments,
  mediaContacts,
}: {
  clientId: string;
  pressReleases: PressRelease[];
  coverageByPress: Record<string, CoverageRow[]>;
  unlinkedCoverage: CoverageRow[];
  clippingsByCoverage: Record<string, Document[]>;
  pressReleaseCommitments: { client_deliverable_id: string; label: string }[];
  mediaContacts: MediaContactRef[];
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
          + New press release
        </button>
      </div>

      {pressReleases.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
          No press releases logged yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {pressReleases.map((p) => (
            <PressReleaseRow
              key={p.press_release_id}
              row={p}
              coverage={coverageByPress[p.press_release_id] ?? []}
              clippingsByCoverage={clippingsByCoverage}
              clientId={clientId}
              pressReleaseCommitments={pressReleaseCommitments}
              mediaContacts={mediaContacts}
            />
          ))}
        </ul>
      )}

      {unlinkedCoverage.length > 0 && (
        <div className="mt-4 rounded-md border border-aegis-gray-100 bg-aegis-gray-50/40 p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-aegis-gray-500">
            Unlinked coverage ({unlinkedCoverage.length})
          </p>
          <ul className="space-y-1.5">
            {unlinkedCoverage.map((c) => (
              <CoverageRowItem
                key={c.coverage_id}
                row={c}
                clippings={clippingsByCoverage[c.coverage_id] ?? []}
                clientId={clientId}
                mediaContacts={mediaContacts}
              />
            ))}
          </ul>
        </div>
      )}

      <NewPressReleaseModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        clientId={clientId}
        pressReleaseCommitments={pressReleaseCommitments}
        mediaContacts={mediaContacts}
      />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Press release row + nested coverage list
// ─────────────────────────────────────────────────────────────────────────

function PressReleaseRow({
  row,
  coverage,
  clippingsByCoverage,
  clientId,
  pressReleaseCommitments,
  mediaContacts,
}: {
  row: PressRelease;
  coverage: CoverageRow[];
  clippingsByCoverage: Record<string, Document[]>;
  clientId: string;
  pressReleaseCommitments: { client_deliverable_id: string; label: string }[];
  mediaContacts: MediaContactRef[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [coverageOpen, setCoverageOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSetStatus(next: PressReleaseStatus) {
    startTransition(async () => {
      setError(null);
      const r = await setPressReleaseStatusAction(row.press_release_id, next);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="rounded-md border border-aegis-gray-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-aegis-navy">{row.title}</span>
            <span
              className={[
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                STATUS_BADGE[row.status],
              ].join(' ')}
            >
              {PRESS_RELEASE_STATUS_LABEL[row.status]}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
              {PRESS_RELEASE_TYPE_LABEL[row.release_type]}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
            {row.release_date && <span>Release: {formatDate(row.release_date)}</span>}
            {row.distributed_at && (
              <span>
                Distributed:{' '}
                {new Date(row.distributed_at).toLocaleDateString(undefined, {
                  dateStyle: 'medium',
                })}
              </span>
            )}
            {row.distribution_media_ids.length > 0 && (
              <span>{row.distribution_media_ids.length} media on list</span>
            )}
          </div>
          {row.body && (
            <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap text-[12px] text-aegis-gray-500">
              {row.body}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setCoverageOpen((v) => !v)}
              className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
            >
              {coverageOpen ? 'Hide' : `Coverage${coverage.length ? ` (${coverage.length})` : ''}`}
            </button>
          </div>
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <select
            value={row.status}
            onChange={(e) => onSetStatus(e.target.value as PressReleaseStatus)}
            disabled={pending}
            className="rounded-md border border-aegis-gray-200 bg-white px-2 py-1 text-[11px] text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10 disabled:opacity-60"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {PRESS_RELEASE_STATUS_LABEL[s]}
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
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
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
            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18" />
              <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
            </svg>
          </button>
        </div>
      </div>

      {coverageOpen && (
        <CoverageList
          clientId={clientId}
          pressReleaseId={row.press_release_id}
          coverage={coverage}
          clippingsByCoverage={clippingsByCoverage}
          mediaContacts={mediaContacts}
        />
      )}

      <EditPressReleaseModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        row={row}
        clientId={clientId}
        pressReleaseCommitments={pressReleaseCommitments}
        mediaContacts={mediaContacts}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deletePressReleaseAction(row.press_release_id)}
        title="Delete press release?"
        description="Linked coverage rows are kept (their press_release_id is set to null)."
        confirmLabel="Delete press release"
        destructive
      />
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Coverage list (under a press release or for unlinked rows)
// ─────────────────────────────────────────────────────────────────────────

function CoverageList({
  clientId,
  pressReleaseId,
  coverage,
  clippingsByCoverage,
  mediaContacts,
}: {
  clientId: string;
  pressReleaseId: string | null;
  coverage: CoverageRow[];
  clippingsByCoverage: Record<string, Document[]>;
  mediaContacts: MediaContactRef[];
}) {
  const [addOpen, setAddOpen] = useState(false);

  return (
    <div className="mt-3 rounded-md border border-aegis-gray-100 bg-aegis-gray-50/40 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-aegis-gray-500">
          Coverage ({coverage.length})
        </p>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="text-[11px] font-medium text-aegis-navy hover:text-aegis-orange"
        >
          + Add coverage
        </button>
      </div>

      {coverage.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-aegis-gray-300">
          No coverage logged yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {coverage.map((c) => (
            <CoverageRowItem
              key={c.coverage_id}
              row={c}
              clippings={clippingsByCoverage[c.coverage_id] ?? []}
              clientId={clientId}
              mediaContacts={mediaContacts}
            />
          ))}
        </ul>
      )}

      <NewCoverageModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        clientId={clientId}
        pressReleaseId={pressReleaseId}
        mediaContacts={mediaContacts}
      />
    </div>
  );
}

function CoverageRowItem({
  row,
  clippings,
  clientId,
  mediaContacts,
}: {
  row: CoverageRow;
  clippings: Document[];
  clientId: string;
  mediaContacts: MediaContactRef[];
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [clippingPending, startClipping] = useTransition();
  const [clippingError, setClippingError] = useState<string | null>(null);

  function openClipping(doc: Document) {
    startClipping(async () => {
      setClippingError(null);
      // External-link docs have a stable URL we can open directly. Uploaded
      // files need a fresh signed URL (60s TTL) since the bucket is private.
      if (doc.external_url) {
        window.open(doc.external_url, '_blank', 'noopener,noreferrer');
        return;
      }
      const r = await getDocumentDownloadUrlAction(doc.document_id);
      if (!r.ok || !r.url) {
        setClippingError(r.error ?? 'Could not open clipping.');
        return;
      }
      window.open(r.url, '_blank', 'noopener,noreferrer');
    });
  }

  return (
    <li className="rounded border border-aegis-gray-100 bg-white px-2.5 py-2">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {row.url ? (
              <a
                href={row.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[12px] font-medium text-aegis-navy hover:text-aegis-orange"
              >
                {row.headline}
              </a>
            ) : (
              <span className="text-[12px] font-medium text-aegis-gray">
                {row.headline}
              </span>
            )}
            <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
              {COVERAGE_TYPE_LABEL[row.coverage_type]}
            </span>
            {row.sentiment && (
              <span
                className={[
                  'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                  SENTIMENT_BADGE[row.sentiment],
                ].join(' ')}
              >
                {COVERAGE_SENTIMENT_LABEL[row.sentiment]}
              </span>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
            <span>{row.publication_name}</span>
            {row.reporter_name && <span>· {row.reporter_name}</span>}
            <span className="tabular-nums">
              {new Date(row.publication_date).toLocaleDateString(undefined, {
                dateStyle: 'medium',
              })}
            </span>
            {row.reach_estimate != null && (
              <span className="tabular-nums">Reach: {formatNumber(row.reach_estimate)}</span>
            )}
            {row.ave_value != null && (
              <span className="tabular-nums">
                AVE: {row.currency} {formatNumber(row.ave_value)}
              </span>
            )}
            {row.prv_value != null && (
              <span className="tabular-nums">
                PRV: {row.currency} {formatNumber(row.prv_value)}
              </span>
            )}
          </div>
          {clippings.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {clippings.map((doc) => (
                <button
                  key={doc.document_id}
                  type="button"
                  onClick={() => openClipping(doc)}
                  disabled={clippingPending}
                  className="inline-flex items-center gap-1 rounded border border-aegis-gray-200 bg-white px-2 py-0.5 text-[10px] font-medium text-aegis-navy hover:bg-aegis-navy-50 disabled:opacity-60"
                >
                  <svg
                    className="h-2.5 w-2.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  {doc.external_url ? 'Link' : 'Clipping'}
                </button>
              ))}
            </div>
          )}
          {clippingError && (
            <p className="mt-1 text-[11px] text-red-600">{clippingError}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setEditOpen(true)}
            title="Edit"
            aria-label="Edit"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-aegis-gray-500 hover:bg-aegis-navy-50 hover:text-aegis-navy"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            title="Delete"
            aria-label="Delete"
            className="inline-flex h-6 w-6 items-center justify-center rounded text-aegis-gray-300 hover:bg-red-50 hover:text-red-600"
          >
            <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 6h18" />
              <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
            </svg>
          </button>
        </div>
      </div>

      <EditCoverageModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        row={row}
        clientId={clientId}
        mediaContacts={mediaContacts}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deleteCoverageAction(row.coverage_id)}
        title="Delete coverage entry?"
        description={`This permanently removes "${row.headline}" from the coverage log.`}
        confirmLabel="Delete"
        destructive
      />
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Modals
// ─────────────────────────────────────────────────────────────────────────

function NewPressReleaseModal({
  open,
  onClose,
  clientId,
  pressReleaseCommitments,
  mediaContacts,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  pressReleaseCommitments: { client_deliverable_id: string; label: string }[];
  mediaContacts: MediaContactRef[];
}) {
  const [state, action] = useActionState(createPressReleaseAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New press release"
      description="Draft, approve, distribute. Coverage rows attach to this release once it's published."
      size="2xl"
    >
      <form action={action} className="space-y-4">
        <PressReleaseFormFields
          clientId={clientId}
          pressReleaseCommitments={pressReleaseCommitments}
          mediaContacts={mediaContacts}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditPressReleaseModal({
  open,
  onClose,
  row,
  clientId,
  pressReleaseCommitments,
  mediaContacts,
}: {
  open: boolean;
  onClose: () => void;
  row: PressRelease;
  clientId: string;
  pressReleaseCommitments: { client_deliverable_id: string; label: string }[];
  mediaContacts: MediaContactRef[];
}) {
  const [state, action] = useActionState(updatePressReleaseAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit press release" size="2xl">
      <form action={action} className="space-y-4">
        <PressReleaseFormFields
          initial={row}
          clientId={clientId}
          pressReleaseCommitments={pressReleaseCommitments}
          mediaContacts={mediaContacts}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function NewCoverageModal({
  open,
  onClose,
  clientId,
  pressReleaseId,
  mediaContacts,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  pressReleaseId: string | null;
  mediaContacts: MediaContactRef[];
}) {
  const [state, action] = useActionState(createCoverageAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add coverage"
      description="Online: paste the URL. Print/broadcast: leave URL blank, attach the clipping as a document afterwards."
    >
      <form action={action} className="space-y-4">
        <CoverageFormFields
          clientId={clientId}
          pressReleaseId={pressReleaseId}
          mediaContacts={mediaContacts}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditCoverageModal({
  open,
  onClose,
  row,
  clientId,
  mediaContacts,
}: {
  open: boolean;
  onClose: () => void;
  row: CoverageRow;
  clientId: string;
  mediaContacts: MediaContactRef[];
}) {
  const [state, action] = useActionState(updateCoverageAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal open={open} onClose={onClose} title="Edit coverage" description={row.headline}>
      <form action={action} className="space-y-4">
        <CoverageFormFields
          initial={row}
          clientId={clientId}
          pressReleaseId={row.press_release_id}
          mediaContacts={mediaContacts}
        />
        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
