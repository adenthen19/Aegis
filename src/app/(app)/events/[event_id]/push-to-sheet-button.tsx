'use client';

import { useState, useTransition } from 'react';
import Modal from '@/components/ui/modal';
import { pushAttendanceToSheetAction } from '../sheets-actions';

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
  const [sheetInput, setSheetInput] = useState(
    defaultSheetId
      ? `https://docs.google.com/spreadsheets/d/${defaultSheetId}/edit`
      : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    sheet_url: string;
    rows_written: number;
  } | null>(null);

  function reset() {
    setError(null);
    setResult(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    reset();
    if (!sheetInput.trim()) {
      setError('Paste the Google Sheets URL.');
      return;
    }
    startTransition(async () => {
      const res = await pushAttendanceToSheetAction(eventId, sheetInput.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setResult({
        sheet_url: res.sheet_url,
        rows_written: res.rows_written,
      });
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          reset();
          setOpen(true);
        }}
        className="inline-flex items-center gap-1.5 rounded-md border border-aegis-blue/30 bg-aegis-blue-50 px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-blue-100"
        title={
          googleConnected
            ? `Push attendance to a Google Sheet using ${googleEmail}.`
            : 'Connect your Google account first.'
        }
      >
        <SheetsIcon />
        Google Sheet
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Push attendance to Google Sheet"
        description="Writes the guest list and check-in state into a sheet you can edit."
      >
        {!googleConnected ? (
          <NotConnectedNotice onClose={() => setOpen(false)} />
        ) : result ? (
          <SuccessView
            sheetUrl={result.sheet_url}
            rowsWritten={result.rows_written}
            onClose={() => {
              setOpen(false);
              setResult(null);
            }}
          />
        ) : (
          <form onSubmit={submit} className="space-y-4">
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
                onChange={(e) => setSheetInput(e.target.value)}
                className="w-full rounded-md border border-aegis-gray-200 bg-white px-3 py-2 text-sm text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
              />
              <p className="mt-1.5 text-[11px] text-aegis-gray-500">
                Paste the full URL or just the id between <code>/d/</code> and
                <code>/edit</code>. The sheet must be editable by{' '}
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
              <li>Re-run any time — the tab is cleared and rewritten on each push.</li>
              <li>Other tabs in the sheet are untouched.</li>
            </ul>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => setOpen(false)}
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
                {pending && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" aria-hidden>
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                  </svg>
                )}
                {pending ? 'Pushing…' : 'Push to sheet'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </>
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
        page first, then come back here to push.
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
  sheetUrl,
  rowsWritten,
  onClose,
}: {
  sheetUrl: string;
  rowsWritten: number;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        <p className="font-semibold">Pushed successfully.</p>
        <p className="mt-1 text-emerald-700">
          {rowsWritten} guest row{rowsWritten === 1 ? '' : 's'} written to the
          &ldquo;Aegis Attendance&rdquo; tab.
        </p>
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
          href={sheetUrl}
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
