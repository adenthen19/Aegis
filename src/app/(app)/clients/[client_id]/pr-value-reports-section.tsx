'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import ConfirmDialog from '@/components/ui/confirm-dialog';
import {
  DateTimeField,
  FormActions,
  FormError,
  TextAreaField,
  TextField,
} from '@/components/ui/form';
import type { PrValueReport } from '@/lib/types';
import {
  type ActionState,
  clearReportSentAction,
  deletePrValueReportAction,
  generatePrValueReportAction,
  markReportSentAction,
  updatePrValueReportAction,
} from '../pr-value-reports-actions';

const initialState: ActionState = { ok: false, error: null };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString();
}

export default function PrValueReportsSection({
  clientId,
  reports,
  primaryEmail,
}: {
  clientId: string;
  reports: PrValueReport[];
  primaryEmail: string | null;
}) {
  const [generateOpen, setGenerateOpen] = useState(false);

  return (
    <>
      <div className="mb-3 flex items-center justify-end">
        <button
          type="button"
          onClick={() => setGenerateOpen(true)}
          className="text-xs font-medium text-aegis-navy hover:text-aegis-orange"
        >
          + Generate report
        </button>
      </div>

      {reports.length === 0 ? (
        <p className="rounded-md border border-dashed border-aegis-gray-200 bg-aegis-gray-50/40 px-4 py-6 text-center text-xs text-aegis-gray-500">
          No reports generated yet. Click <span className="font-medium">Generate report</span> to
          summarise coverage for a period.
        </p>
      ) : (
        <ul className="space-y-2">
          {reports.map((r) => (
            <ReportRow
              key={r.report_id}
              row={r}
              clientId={clientId}
              primaryEmail={primaryEmail}
            />
          ))}
        </ul>
      )}

      <GenerateReportModal
        open={generateOpen}
        onClose={() => setGenerateOpen(false)}
        clientId={clientId}
      />
    </>
  );
}

function ReportRow({
  row,
  clientId,
  primaryEmail,
}: {
  row: PrValueReport;
  clientId: string;
  primaryEmail: string | null;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isSent = !!row.sent_to_client_at;

  function onClearSent() {
    startTransition(async () => {
      setError(null);
      const r = await clearReportSentAction(row.report_id);
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <li className="rounded-md border border-aegis-gray-100 bg-white px-4 py-3">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-aegis-navy">{row.title}</span>
            {isSent ? (
              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-emerald-700 ring-1 ring-inset ring-emerald-200">
                Sent
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-aegis-gray-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aegis-gray-500 ring-1 ring-inset ring-aegis-gray-200">
                Not sent
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-aegis-gray-500">
            <span className="tabular-nums">
              {formatDate(row.period_start)} → {formatDate(row.period_end)}
            </span>
            <span>{row.total_coverage_count} pieces</span>
            <span className="tabular-nums">
              Reach: {formatNumber(row.total_reach)}
            </span>
            <span className="tabular-nums">
              AVE: {row.currency} {formatNumber(row.total_ave)}
            </span>
            <span className="tabular-nums">
              PRV: {row.currency} {formatNumber(row.total_prv)}
            </span>
          </div>
          {row.sent_to_client_at && (
            <p className="mt-1 text-[11px] text-aegis-gray-500">
              Sent {new Date(row.sent_to_client_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
              {row.sent_to_email && <> to {row.sent_to_email}</>}
            </p>
          )}
          {row.notes && (
            <p className="mt-1.5 whitespace-pre-wrap text-[12px] text-aegis-gray-500">
              {row.notes}
            </p>
          )}
          {error && <p className="mt-1 text-[11px] text-red-600">{error}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {isSent ? (
            <button
              type="button"
              onClick={onClearSent}
              disabled={pending}
              className="text-[11px] font-medium text-aegis-gray-500 hover:text-aegis-orange-600 disabled:opacity-50"
            >
              Mark unsent
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSendOpen(true)}
              className="rounded-md bg-aegis-navy px-2.5 py-1 text-[11px] font-medium text-white hover:bg-aegis-navy-700"
            >
              Mark sent
            </button>
          )}
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

      <EditReportModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        row={row}
        clientId={clientId}
      />
      <SendReportModal
        open={sendOpen}
        onClose={() => setSendOpen(false)}
        row={row}
        defaultEmail={primaryEmail}
      />
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => deletePrValueReportAction(row.report_id)}
        title="Delete report?"
        description="This permanently removes the report. The coverage rows it summarises are kept."
        confirmLabel="Delete report"
        destructive
      />
    </li>
  );
}

function GenerateReportModal({
  open,
  onClose,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  clientId: string;
}) {
  const [state, action] = useActionState(generatePrValueReportAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generate PR value report"
      description="Sums coverage pieces, reach, AVE, and PRV in the selected period and snapshots them on the report row."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="client_id" value={clientId} />

        <TextField
          name="title"
          label="Title"
          required
          placeholder="e.g. Q1 FY2026 PR Value Report"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <DateTimeField
            name="period_start"
            label="Period start"
            required
            type="date"
          />
          <DateTimeField
            name="period_end"
            label="Period end"
            required
            type="date"
          />
        </div>

        <TextField
          name="currency"
          label="Currency"
          placeholder="MYR"
          defaultValue="MYR"
          hint="Coverage rows are summed in their own currency without FX conversion."
        />

        <TextAreaField
          name="notes"
          label="Notes"
          rows={2}
          placeholder="Highlights, caveats, recommendations…"
        />

        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function EditReportModal({
  open,
  onClose,
  row,
  clientId,
}: {
  open: boolean;
  onClose: () => void;
  row: PrValueReport;
  clientId: string;
}) {
  const [state, action] = useActionState(updatePrValueReportAction, initialState);

  useEffect(() => {
    if (state.ok) onClose();
  }, [state, onClose]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit report"
      description="Title and notes only — totals are frozen at generation time. Generate a new report for fresh totals."
    >
      <form action={action} className="space-y-4">
        <input type="hidden" name="report_id" value={row.report_id} />
        <input type="hidden" name="client_id" value={clientId} />

        <TextField
          name="title"
          label="Title"
          required
          defaultValue={row.title}
        />
        <TextAreaField
          name="notes"
          label="Notes"
          rows={3}
          defaultValue={row.notes ?? undefined}
        />

        <FormError message={state.error} />
        <FormActions onCancel={onClose} />
      </form>
    </Modal>
  );
}

function SendReportModal({
  open,
  onClose,
  row,
  defaultEmail,
}: {
  open: boolean;
  onClose: () => void;
  row: PrValueReport;
  defaultEmail: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState(defaultEmail ?? '');

  function onConfirm() {
    startTransition(async () => {
      setError(null);
      const r = await markReportSentAction(row.report_id, email || null);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onClose();
    });
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Mark report sent"
      description="Records that this report was delivered to the client. Email integration comes in Phase 3."
    >
      <div className="space-y-4">
        <div>
          <label
            htmlFor="recipient_email"
            className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
          >
            Recipient email
          </label>
          <input
            id="recipient_email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={defaultEmail ?? 'recipient@client.com'}
            className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 outline-none transition-colors focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
          />
          <p className="mt-1 text-[11px] text-aegis-gray-300">
            For now this just stamps a sent-at timestamp. Phase 3 will actually send the email.
          </p>
        </div>

        {error && (
          <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
            {error}
          </div>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex items-center justify-center rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {pending ? 'Saving…' : 'Mark sent'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
