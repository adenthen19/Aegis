'use client';

import { useState } from 'react';
import Link from 'next/link';
import DataTableSelectable, {
  type BulkAction,
  type SortState,
} from '@/components/data-table-selectable';
import type { MediaContact } from '@/lib/types';
import { whatsAppUrl } from '@/lib/contact-helpers';
import {
  displayCompany,
  displayEmail,
  displayName,
  displayPhone,
} from '@/lib/display-format';
import MediaRowActions from './row-actions';
import { bulkDeleteMediaContactsAction } from './actions';

function downloadCsv(filename: string, rows: string[][]) {
  const escape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body = '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n') + '\r\n';
  const blob = new Blob([body], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MediaList({
  rows,
  sortState,
  emptyMessage,
}: {
  rows: MediaContact[];
  sortState: SortState;
  emptyMessage: string;
}) {
  const bulkActions: BulkAction<MediaContact>[] = [
    {
      label: 'Export emails (CSV)',
      run: async (selected) => {
        const withEmail = selected.filter((r) => r.email);
        if (withEmail.length === 0) {
          return { ok: false, error: 'None of the selected contacts have an email on file.' };
        }
        const csv = [
          ['name', 'company', 'state', 'email'],
          ...withEmail.map((r) => [
            r.full_name,
            r.company_name ?? '',
            r.state ?? '',
            r.email ?? '',
          ]),
        ];
        const stamp = new Date().toISOString().slice(0, 10);
        downloadCsv(`media-emails-${stamp}.csv`, csv);
        return { ok: true, error: null };
      },
    },
    {
      label: 'Delete',
      variant: 'destructive',
      confirmMessage: (rows) =>
        `Delete ${rows.length} contact${rows.length === 1 ? '' : 's'}? This cannot be undone.`,
      run: async (selected) => {
        const ids = selected.map((r) => r.media_id);
        return await bulkDeleteMediaContactsAction(ids);
      },
    },
  ];

  // Hide the Email column when nobody has one — saves a column of dashes.
  const anyEmail = rows.some((r) => !!r.email);

  return (
    <DataTableSelectable<MediaContact>
      rows={rows}
      sortState={sortState}
      getId={(r) => r.media_id}
      bulkActions={bulkActions}
      emptyMessage={emptyMessage}
      columns={[
        {
          header: 'Name',
          sortKey: 'full_name',
          cell: (r) => (
            <Link
              href={`/media/${r.media_id}`}
              className="font-medium text-aegis-navy hover:text-aegis-orange"
            >
              {displayName(r.full_name)}
            </Link>
          ),
        },
        {
          header: 'Company',
          sortKey: 'company_name',
          cell: (r) =>
            r.company_name ? (
              displayCompany(r.company_name)
            ) : (
              <span className="text-aegis-gray-300">—</span>
            ),
        },
        {
          header: 'State',
          sortKey: 'state',
          cell: (r) =>
            r.state ? (
              <span className="inline-flex rounded-full bg-aegis-blue-50 px-2.5 py-0.5 text-xs font-medium text-aegis-navy">
                {r.state}
              </span>
            ) : (
              <span className="text-aegis-gray-300">—</span>
            ),
        },
        {
          header: 'Contact',
          cell: (r) => {
            if (!r.contact_number) {
              return <span className="text-aegis-gray-300">—</span>;
            }
            return <ContactCell raw={r.contact_number} />;
          },
        },
        ...(anyEmail
          ? [
              {
                header: 'Email',
                sortKey: 'email',
                cell: (r: MediaContact) => {
                  const lower = displayEmail(r.email);
                  return lower ? (
                    <a
                      href={`mailto:${lower}`}
                      className="text-aegis-navy hover:text-aegis-orange"
                    >
                      {lower}
                    </a>
                  ) : (
                    <span className="text-aegis-gray-300">—</span>
                  );
                },
              },
            ]
          : []),
        { header: '', cell: (r) => <MediaRowActions row={r} /> },
      ]}
    />
  );
}

// Same pattern as the analyst list — phone link + hover copy button.
// Kept inline rather than extracted to a shared component because the
// markup is short and the table-cell context is tightly coupled.
function ContactCell({ raw }: { raw: string }) {
  const wa = whatsAppUrl(raw);
  const display = displayPhone(raw);
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(display).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    });
  }

  return (
    <span className="group/contact inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums">
      {wa ? (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="text-aegis-gray hover:text-emerald-600"
          title="Open WhatsApp chat"
        >
          {display}
        </a>
      ) : (
        <span className="text-aegis-gray">{display}</span>
      )}
      <button
        type="button"
        onClick={copy}
        title={copied ? 'Copied!' : 'Copy number'}
        aria-label="Copy number"
        className={[
          'inline-flex h-5 w-5 items-center justify-center rounded text-aegis-gray-300 transition-opacity hover:bg-aegis-gray-100 hover:text-aegis-navy',
          'opacity-0 group-hover/contact:opacity-100 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-aegis-navy/20',
          copied ? 'text-emerald-600 opacity-100' : '',
        ].join(' ')}
      >
        {copied ? (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12l5 5 9-11" />
          </svg>
        ) : (
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" />
          </svg>
        )}
      </button>
    </span>
  );
}
