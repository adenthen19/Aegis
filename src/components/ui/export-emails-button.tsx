'use client';

import { useEffect, useState, useTransition } from 'react';
import { useSearchParams } from 'next/navigation';
import Modal from './modal';

type ExportResult = { emails: string[]; error: string | null };
type ExportAction = (q: string) => Promise<ExportResult>;

export default function ExportEmailsButton({
  action,
  label = 'Export emails',
  modalTitle = 'Export emails for BCC',
}: {
  action: ExportAction;
  label?: string;
  modalTitle?: string;
}) {
  const [open, setOpen] = useState(false);
  const [emails, setEmails] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const q = searchParams.get('q') ?? '';

  useEffect(() => {
    if (!open) return;
    startTransition(async () => {
      const res = await action(q);
      if (res.error) {
        setError(res.error);
        setEmails([]);
      } else {
        setError(null);
        setEmails(res.emails);
      }
    });
  }, [open, q, action]);

  const joined = emails.join('; ');

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(joined);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Unable to copy. Select the text and copy manually.');
    }
  }

  function downloadTxt() {
    const blob = new Blob([joined], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bcc-emails.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-navy shadow-sm transition-colors hover:bg-aegis-gray-50"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 4h16v16H4z" />
          <path d="M4 8l8 5 8-5" />
        </svg>
        {label}
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={modalTitle}
        description={
          q
            ? `Emails matching the current search "${q}" — paste into the BCC field of your mail client.`
            : 'All emails on file — paste into the BCC field of your mail client.'
        }
      >
        <div className="space-y-4">
          {pending && (
            <p className="text-xs text-aegis-gray-500">Loading emails…</p>
          )}

          {error && (
            <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
              {error}
            </div>
          )}

          {!pending && !error && (
            <>
              <p className="text-xs text-aegis-gray-500">
                {emails.length} address{emails.length === 1 ? '' : 'es'} found.
                {emails.length > 0 && ' Use the buttons below or select-all + copy.'}
              </p>

              <textarea
                readOnly
                value={joined}
                rows={6}
                onFocus={(e) => e.currentTarget.select()}
                className="w-full resize-y rounded-md border border-aegis-gray-200 bg-aegis-gray-50 px-3 py-2 font-mono text-xs text-aegis-gray-900 outline-none focus:border-aegis-navy focus:ring-2 focus:ring-aegis-navy/10"
              />

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={downloadTxt}
                  disabled={emails.length === 0}
                  className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-navy hover:bg-aegis-gray-50 disabled:opacity-50"
                >
                  Download .txt
                </button>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  disabled={emails.length === 0}
                  className="inline-flex items-center justify-center rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-aegis-orange-600 disabled:opacity-60"
                >
                  {copied ? 'Copied!' : 'Copy to clipboard'}
                </button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
