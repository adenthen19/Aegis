'use client';

import { useActionState, useEffect, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Modal from '@/components/ui/modal';
import { CLIENT_IMPORT_FIELD_HELP } from '@/lib/client-import';
import { importClientsAction, type ImportState } from './actions';

const initial: ImportState = {
  ok: false,
  error: null,
  imported: 0,
  skipped: 0,
  errors: [],
};

export default function ImportClients() {
  const [open, setOpen] = useState(false);
  const [state, action] = useActionState(importClientsAction, initial);

  // Auto-close after a fully successful import (no row errors).
  useEffect(() => {
    if (state.ok && state.errors.length === 0 && state.imported > 0) {
      const t = setTimeout(() => setOpen(false), 1500);
      return () => clearTimeout(t);
    }
  }, [state]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-aegis-gray-200 bg-white px-4 py-2.5 text-sm font-medium text-aegis-navy shadow-sm transition-colors hover:bg-aegis-gray-50 sm:w-auto sm:py-2"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12" />
          <path d="M7 8l5-5 5 5" />
          <path d="M5 21h14" />
        </svg>
        Import from Excel
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Import clients from Excel"
        description="Upload a CSV file (.csv) — Excel can read and save this format directly."
      >
        <form action={action} className="space-y-5">
          <section className="rounded-md border border-aegis-gray-100 bg-aegis-gray-50 px-4 py-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-aegis-gray-500">
              Step 1 — Download the template
            </h3>
            <p className="mt-1 text-xs text-aegis-gray-500">
              Open it in Excel, fill in your rows, then save as CSV (UTF-8).
            </p>
            <a
              href="/api/clients/template"
              download
              className="mt-3 inline-flex items-center gap-2 rounded-md border border-aegis-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-aegis-navy hover:bg-aegis-gray-50"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3v12" />
                <path d="M7 12l5 5 5-5" />
                <path d="M5 21h14" />
              </svg>
              Download template (.csv)
            </a>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-aegis-gray-500">
              Column reference
            </h3>
            <ul className="mt-2 space-y-1.5 text-xs text-aegis-gray">
              {CLIENT_IMPORT_FIELD_HELP.map((f) => (
                <li key={f.name} className="flex gap-2">
                  <code className="shrink-0 rounded bg-aegis-navy-50 px-1.5 py-0.5 font-mono text-[11px] text-aegis-navy">
                    {f.name}
                    {f.required && <span className="text-aegis-orange">*</span>}
                  </code>
                  <span className="text-aegis-gray-500">{f.help}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-aegis-gray-300">
              Logo and stakeholders (CEO, CFO, advisors, etc.) aren&apos;t imported — set them per-client after import.
            </p>
          </section>

          <section>
            <h3 className="text-xs font-semibold uppercase tracking-[0.06em] text-aegis-gray-500">
              Step 2 — Upload your file
            </h3>
            <input
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="mt-2 block w-full text-xs text-aegis-gray file:mr-3 file:rounded-md file:border-0 file:bg-aegis-navy file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white hover:file:bg-aegis-navy-700"
            />
          </section>

          {state.error && (
            <div className="rounded-md border border-aegis-orange/30 bg-aegis-orange-50 px-3 py-2 text-xs text-aegis-orange-600">
              {state.error}
            </div>
          )}

          {state.ok && state.imported > 0 && (
            <div className="rounded-md border border-green-300 bg-green-50 px-3 py-2 text-xs text-green-800">
              Imported {state.imported} client{state.imported === 1 ? '' : 's'} successfully
              {state.errors.length > 0 ? `; ${state.errors.length} row(s) skipped — see below.` : '.'}
            </div>
          )}

          {state.errors.length > 0 && (
            <div className="rounded-md border border-aegis-orange/30 bg-white">
              <p className="border-b border-aegis-gray-100 px-3 py-2 text-xs font-medium text-aegis-orange-600">
                Row errors ({state.errors.length})
              </p>
              <ul className="aegis-scroll max-h-40 overflow-y-auto divide-y divide-aegis-gray-100 text-xs text-aegis-gray">
                {state.errors.map((e) => (
                  <li key={e.row} className="flex gap-3 px-3 py-1.5">
                    <span className="font-mono text-aegis-gray-500">Row {e.row}</span>
                    <span className="flex-1">{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <ImportFormActions onCancel={() => setOpen(false)} />
        </form>
      </Modal>
    </>
  );
}

function ImportFormActions({ onCancel }: { onCancel: () => void }) {
  const { pending } = useFormStatus();
  return (
    <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <button
        type="button"
        onClick={onCancel}
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md border border-aegis-gray-200 bg-white px-4 py-2 text-sm font-medium text-aegis-gray hover:bg-aegis-gray-50 disabled:opacity-50"
      >
        Close
      </button>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-md bg-aegis-orange px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-aegis-orange-600 disabled:opacity-60"
      >
        {pending && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" opacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
        )}
        {pending ? 'Importing…' : 'Import'}
      </button>
    </div>
  );
}
