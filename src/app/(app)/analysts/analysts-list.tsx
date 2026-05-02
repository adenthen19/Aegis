'use client';

import { useState } from 'react';
import Link from 'next/link';
import DataTableSelectable, {
  type BulkAction,
  type SortState,
} from '@/components/data-table-selectable';
import type { Analyst } from '@/lib/types';
import { whatsAppUrl } from '@/lib/contact-helpers';
import {
  displayCompany,
  displayEmail,
  displayName,
  displayPhone,
} from '@/lib/display-format';
import AnalystRowActions from './row-actions';
import { bulkDeleteAnalystsAction } from './actions';

function downloadCsv(filename: string, rows: string[][]) {
  // UTF-8 BOM so Excel auto-detects encoding for non-ASCII names.
  const escape = (v: string) => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const body =
    '﻿' + rows.map((r) => r.map(escape).join(',')).join('\r\n') + '\r\n';
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

export default function AnalystsList({
  rows,
  sortState,
  emptyMessage,
}: {
  rows: Analyst[];
  sortState: SortState;
  emptyMessage: string;
}) {
  const bulkActions: BulkAction<Analyst>[] = [
    {
      label: 'Export emails (CSV)',
      run: async (selected) => {
        const withEmail = selected.filter((r) => r.email);
        if (withEmail.length === 0) {
          return { ok: false, error: 'None of the selected analysts have an email on file.' };
        }
        const csv = [
          ['name', 'institution', 'email', 'analyst_type'],
          ...withEmail.map((r) => [
            r.full_name ?? '',
            r.institution_name,
            r.email ?? '',
            r.analyst_type,
          ]),
        ];
        const stamp = new Date().toISOString().slice(0, 10);
        downloadCsv(`analyst-emails-${stamp}.csv`, csv);
        return { ok: true, error: null };
      },
    },
    {
      label: 'Delete',
      variant: 'destructive',
      confirmMessage: (rows) =>
        `Delete ${rows.length} analyst${rows.length === 1 ? '' : 's'}? This cannot be undone.`,
      run: async (selected) => {
        const ids = selected.map((r) => r.investor_id);
        return await bulkDeleteAnalystsAction(ids);
      },
    },
  ];

  // Hide the Email column when nobody has one — saves a column of dashes.
  const anyEmail = rows.some((r) => !!r.email);

  return (
    <DataTableSelectable<Analyst>
      rows={rows}
      sortState={sortState}
      getId={(r) => r.investor_id}
      bulkActions={bulkActions}
      emptyMessage={emptyMessage}
      columns={[
        {
          header: 'Name',
          sortKey: 'full_name',
          cell: (r) => (
            <Link
              href={`/analysts/${r.investor_id}`}
              className="font-medium text-aegis-navy hover:text-aegis-orange"
            >
              {r.full_name ? (
                displayName(r.full_name)
              ) : (
                <span className="text-aegis-gray-300">—</span>
              )}
            </Link>
          ),
        },
        {
          header: 'Institution',
          sortKey: 'institution_name',
          cell: (r) => displayCompany(r.institution_name),
        },
        {
          header: 'Type',
          sortKey: 'analyst_type',
          cell: (r) => (
            <span className="whitespace-nowrap text-aegis-gray">
              {r.analyst_type === 'buy_side' ? 'Buy' : 'Sell'}
            </span>
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
                cell: (r: Analyst) => {
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
        { header: '', cell: (r) => <AnalystRowActions row={r} /> },
      ]}
    />
  );
}

// Compact phone cell with WhatsApp link + a copy-to-clipboard mini-button
// that fades in on row hover. Stays out of the way otherwise so the table
// keeps its clean look.
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
          // Hidden by default; fade in on row hover or when the button itself is focused.
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
