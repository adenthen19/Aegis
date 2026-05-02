'use client';

import { useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import {
  bindEventToSheetAction,
  syncEventSheetAction,
  unbindEventFromSheetAction,
} from '../sheets-actions';

// Two states:
//   • Not bound: "Bind sheet" — opens dialog with URL input → first push.
//   • Bound:     "Sync sheet" — silently pulls + pushes; menu offers
//                "Open sheet", "Sync now", "Change sheet", "Unbind".
//
// Once bound, kiosks for this event also auto-sync every 15s — this button
// is the manual fallback when no kiosk is open.

export default function PushToSheetButton({
  eventId,
  defaultSheetId,
  googleConnected,
  googleEmail,
}: {
  eventId: string;
  defaultSheetId: string | null;
  googleConnected: boolean;
  googleEmail: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [sheetInput, setSheetInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sheet_url: string;
    pulled_count: number;
    pushed_rows: number;
    just_bound: boolean;
  } | null>(null);

  const isBound = !!defaultSheetId;
  const sheetUrl = defaultSheetId
    ? `https://docs.google.com/spreadsheets/d/${defaultSheetId}/edit`
    : null;

  function reset() {
    setError(null);
    setResult(null);
  }

  function bind(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!sheetInput.trim()) {
      setError('Paste the Google Sheets URL.');
      return;
    }
    startTransition(async () => {
      const res = await bindEventToSheetAction(eventId, sheetInput.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({
        sheet_url: res.sheet_url,
        pulled_count: res.pulled_count,
        pushed_rows: res.pushed_rows,
        just_bound: true,
      });
    });
  }

  function syncNow() {
    reset();
    startTransition(async () => {
      const res = await syncEventSheetAction(eventId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({
        sheet_url: res.sheet_url,
        pulled_count: res.pulled_count,
        pushed_rows: res.pushed_rows,
        just_bound: false,
      });
    });
  }

  function unbind() {
    reset();
    startTransition(async () => {
      const res = await unbindEventFromSheetAction(eventId);
      if (!res.ok) {
        setError(res.error ?? 'Unbind failed.');
        return;
      }
      setOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setSheetInput('');
          setOpen(true);
        }}
        className={[
          'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium',
          isBound
            ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
            : 'border border-aegis-blue/30 bg-aegis-blue-50 text-aegis-navy hover:bg-aegis-blue-100',
        ].join(' ')}
        title={
          isBound
            ? 'Bound to a Google Sheet — click to sync now or change.'
            : 'Bind this event to a Google Sheet for two-way sync.'
        }
      >
        <SheetsIcon />
        {isBound ? 'Sheet · synced' : 'Bind sheet'}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={isBound ? 'Google Sheet sync' : 'Bind to Google Sheet'}
        description={
          isBound
            ? 'Two-way sync is on for this event. Kiosks pull and push every 15 seconds.'
            : 'Writes the guest list and check-in state into a sheet you can edit.'
        }
      >
        {!googleConnected ? (
          <NotConnectedNotice onClose={() => setOpen(false)} />
        ) : result ? (
          <SuccessView
            result={result}
            onClose={() => {
              setOpen(false);
              setResult(null);
            }}
          />
        ) : isBound ? (
          <BoundView
            sheetUrl={sheetUrl!}
            googleEmail={googleEmail}
            pending={pending}
            error={error}
            onSyncNow={syncNow}
            onUnbind={unbind}
            onChange={() => {
              setSheetInput('');
              startTransition(() => {});
            }}
            onClose={() => setOpen(false)}
          />
        ) : (
          <BindForm
            sheetInput={sheetInput}
            onChangeSheetInput={setSheetInput}
            googleEmail={googleEmail}
            pending={pending}
            error={error}
            onSubmit={bind}
            onCancel={() => setOpen(false)}
          />
        )}
      </Modal>
    </>
  );
}

function BindForm({
  sheetInput,
  onChangeSheetInput,
  googleEmail,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  sheetInput: string;
  onChangeSheetInput: (s: string) => void;
  googleEmail: string | null;
  pending: boolean;
  error: string | null;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label
          htmlFor="sheet-url"
          className="mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-aegis-gray-500"
        >
          Google Sheets URL
        </label>
        <input
          id="sheet-url"
          type="url"
          required
          placeholder="https://docs.google.com/spreadsheets/d/…/edit"
          value={sheetInput}
          onChange={(e) => onChangeSheetInput(e.target.value)}
          className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
        />
        <p className="mt-1.5 text-[11px] text-aegis-gray-500">
          The sheet must be editable by{' '}
          <span className="font-medium text-aegis-navy">{googleEmail}</span>.
        </p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <ul className="rounded-md border border-aegis-gray-100 bg-aegis-gray-50/40 px-3 py-2 text-[11px] text-aegis-gray-500">
        <li>
          A tab named <span className="font-medium text-aegis-navy">Aegis Attendance</span>{' '}
          is created (or replaced).
        </li>
        <li>
          Once bound, kiosks for this event poll every 15 s — edits to the
          sheet&apos;s <span className="font-medium text-aegis-navy">Status</span> column flow
          back into Aegis as <span className="font-medium text-aegis-navy">Sheet</span>{' '}
          source check-ins.
        </li>
        <li>Other tabs in the sheet are untouched.</li>
      </ul>

      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
        >
          {pending && <Spinner />}
          {pending ? 'Binding…' : 'Bind & push'}
        </button>
      </div>
    </form>
  );
}

function BoundView({
  sheetUrl,
  googleEmail,
  pending,
  error,
  onSyncNow,
  onUnbind,
  onClose,
}: {
  sheetUrl: string;
  googleEmail: string | null;
  pending: boolean;
  error: string | null;
  onSyncNow: () => void;
  onUnbind: () => void;
  onChange: () => void;
  onClose: () => void;
}) {
  const [confirmingUnbind, setConfirmingUnbind] = useState(false);

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50/60 px-4 py-3">
        <p className="text-sm font-semibold text-emerald-800">
          Two-way sync is on
        </p>
        <p className="mt-0.5 text-[12px] text-emerald-700/90">
          Connected as{' '}
          <span className="font-medium text-emerald-900">{googleEmail}</span>.
          Kiosks for this event sync every 15 seconds; you can also force a
          sync from this dialog.
        </p>
      </div>

      <a
        href={sheetUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-between gap-2 rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-navy hover:bg-aegis-gray-50"
      >
        <span className="flex items-center gap-2">
          <SheetsIcon />
          <span className="truncate">Open sheet in new tab</span>
        </span>
        <span aria-hidden>↗</span>
      </a>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {confirmingUnbind ? (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-aegis-gray-500">
              Unbind — kiosks stop syncing.
            </span>
            <button
              type="button"
              onClick={() => setConfirmingUnbind(false)}
              disabled={pending}
              className="rounded-md border border-aegis-gray-200 bg-white px-2.5 py-1 text-[11px] font-medium text-aegis-gray hover:bg-aegis-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onUnbind}
              disabled={pending}
              className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-60"
            >
              {pending ? '…' : 'Confirm unbind'}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingUnbind(true)}
            disabled={pending}
            className="text-[11px] font-medium text-aegis-gray-500 hover:text-red-600"
          >
            Unbind sheet
          </button>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={onSyncNow}
            disabled={pending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-aegis-orange-600 disabled:opacity-60"
          >
            {pending && <Spinner />}
            {pending ? 'Syncing…' : 'Sync now'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NotConnectedNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-4 py-3 text-sm text-aegis-orange-600">
        Connect your Google account on the{' '}
        <a
          href="/integrations"
          className="font-medium underline hover:text-aegis-navy"
        >
          Integrations
        </a>{' '}
        page first, then come back here.
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50"
        >
          Close
        </button>
        <a
          href="/integrations"
          className="rounded-md bg-aegis-orange px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-aegis-orange-600"
        >
          Open Integrations
        </a>
      </div>
    </div>
  );
}

function SuccessView({
  result,
  onClose,
}: {
  result: {
    sheet_url: string;
    pulled_count: number;
    pushed_rows: number;
    just_bound: boolean;
  };
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <p className="font-semibold">
          {result.just_bound ? 'Sheet bound and pushed.' : 'Synced.'}
        </p>
        <ul className="mt-1 space-y-0.5 text-emerald-700">
          {result.pulled_count > 0 && (
            <li>
              {result.pulled_count} guest
              {result.pulled_count === 1 ? '' : 's'} flipped from sheet edits.
            </li>
          )}
          <li>
            {result.pushed_rows} row{result.pushed_rows === 1 ? '' : 's'}{' '}
            written to the sheet.
          </li>
          {result.pulled_count === 0 && !result.just_bound && (
            <li>No new sheet edits since the last sync.</li>
          )}
        </ul>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50"
        >
          Close
        </button>
        <a
          href={result.sheet_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-1.5 rounded-md bg-aegis-orange px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-aegis-orange-600"
        >
          Open sheet ↗
        </a>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function SheetsIcon() {
  return (
    <svg
      className="h-3.5 w-3.5"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M4 9h16M4 15h16M9 3v18" />
    </svg>
  );
}
