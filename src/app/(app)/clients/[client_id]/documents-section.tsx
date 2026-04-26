'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import {
  AddButton,
  FormActions,
  FormError,
  SelectField,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import {
  DOCUMENT_CATEGORY_LABEL,
  type Document,
  type DocumentCategory,
} from '@/lib/types';
import {
  type ActionState,
  deleteDocumentAction,
  getDocumentDownloadUrlAction,
  uploadDocumentAction,
} from '../documents-actions';

const CATEGORY_OPTIONS = (
  Object.keys(DOCUMENT_CATEGORY_LABEL) as DocumentCategory[]
).map((c) => ({ value: c, label: DOCUMENT_CATEGORY_LABEL[c] }));

const initialState: ActionState = { ok: false, error: null };

function formatBytes(n: number | null): string {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function DocumentsSection({
  clientId,
  documents,
  scope,
}: {
  clientId: string;
  documents: Document[];
  // Optional refinement: if set, uploads from this section get tagged with
  // the matching foreign key so they appear under the right entity later.
  scope?: {
    engagement_id?: string;
    client_deliverable_id?: string;
    schedule_id?: string;
    meeting_id?: string;
  };
}) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <AddButton onClick={() => setUploadOpen(true)} label="Upload document" />
      </div>

      {documents.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
          No documents uploaded yet.
        </p>
      ) : (
        <ul className="divide-y divide-aegis-gray-100 rounded-md border border-aegis-gray-100">
          {documents.map((d) => (
            <DocumentRow key={d.document_id} row={d} />
          ))}
        </ul>
      )}

      <UploadModal
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        clientId={clientId}
        scope={scope}
      />
    </>
  );
}

function DocumentRow({ row }: { row: Document }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  function onDownload() {
    startTransition(async () => {
      setError(null);
      const r = await getDocumentDownloadUrlAction(row.document_id);
      if (!r.ok || !r.url) {
        setError(r.error ?? 'Could not open document.');
        return;
      }
      window.open(r.url, '_blank', 'noopener,noreferrer');
    });
  }

  function onDelete() {
    startTransition(async () => {
      setError(null);
      const r = await deleteDocumentAction(row.document_id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onDownload}
            disabled={pending}
            className="text-left text-sm font-medium text-aegis-navy hover:text-aegis-orange disabled:opacity-60"
          >
            {row.name}
          </button>
          <span className="inline-flex items-center rounded-full bg-aegis-blue-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aegis-navy ring-1 ring-inset ring-aegis-blue/30">
            {DOCUMENT_CATEGORY_LABEL[row.category]}
          </span>
          {row.version > 1 && (
            <span className="text-[10px] uppercase tracking-wide text-aegis-gray-300">
              v{row.version}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
          <span>{formatDate(row.created_at)}</span>
          {row.size_bytes != null && (
            <span className="tabular-nums">{formatBytes(row.size_bytes)}</span>
          )}
          {row.mime_type && <span>{row.mime_type}</span>}
        </div>
        {row.description && (
          <p className="mt-1 whitespace-pre-wrap text-[11px] text-aegis-gray-500">
            {row.description}
          </p>
        )}
        {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onDownload}
          disabled={pending}
          title="Download"
          aria-label="Download"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-aegis-gray-500 hover:bg-aegis-navy-50 hover:text-aegis-navy disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 4v12M6 12l6 6 6-6M4 20h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={pending}
          title="Delete"
          aria-label="Delete"
          className="inline-flex h-7 w-7 items-center justify-center rounded text-aegis-gray-300 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 6h18" />
            <path d="M19 6l-1.5 14a2 2 0 0 1-2 1.8H8.5a2 2 0 0 1-2-1.8L5 6" />
          </svg>
        </button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={async () => {
          onDelete();
          return { ok: true, error: null };
        }}
        title="Delete document?"
        description={`This permanently removes "${row.name}" and the underlying file.`}
        confirmLabel="Delete"
        destructive
      />
    </li>
  );
}

function UploadModal({
  open,
  onClose,
  clientId,
  scope,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
  scope?: {
    engagement_id?: string;
    client_deliverable_id?: string;
    schedule_id?: string;
    meeting_id?: string;
  };
}) {
  const [state, action] = useActionState(uploadDocumentAction, initialState);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>('');

  useEffect(() => {
    if (state.ok) {
      onClose();
      setFileName('');
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Upload document"
      description="PDF / DOCX / images / decks. Max 25 MB."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="client_id" value={clientId} />
        {scope?.engagement_id && (
          <input type="hidden" name="engagement_id" value={scope.engagement_id} />
        )}
        {scope?.client_deliverable_id && (
          <input
            type="hidden"
            name="client_deliverable_id"
            value={scope.client_deliverable_id}
          />
        )}
        {scope?.schedule_id && (
          <input type="hidden" name="schedule_id" value={scope.schedule_id} />
        )}
        {scope?.meeting_id && (
          <input type="hidden" name="meeting_id" value={scope.meeting_id} />
        )}

        <div>
          <label
            htmlFor="document-file"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
          >
            File <span className="ml-0.5 text-aegis-orange">*</span>
          </label>
          <input
            ref={fileRef}
            id="document-file"
            name="file"
            type="file"
            required
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            className="block w-full text-sm text-aegis-gray file:mr-3 file:rounded-md file:border-0 file:bg-aegis-navy file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-aegis-navy-700"
          />
        </div>

        <TextField
          name="name"
          label="Display name"
          placeholder={fileName || 'Defaults to the file name'}
        />

        <SelectField
          name="category"
          label="Category"
          required
          defaultValue="other"
          options={CATEGORY_OPTIONS}
        />

        <TextAreaField
          name="description"
          label="Description"
          rows={2}
          placeholder="Optional context"
        />

        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}
