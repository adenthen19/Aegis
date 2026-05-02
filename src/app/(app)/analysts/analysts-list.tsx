'use client';

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
              {r.analyst_type === 'buy_side' ? 'Buy-side' : 'Sell-side'}
            </span>
          ),
        },
        {
          header: 'Contact',
          cell: (r) => {
            if (!r.contact_number) {
              return <span className="text-aegis-gray-300">—</span>;
            }
            const wa = whatsAppUrl(r.contact_number);
            const display = displayPhone(r.contact_number);
            if (!wa) {
              return (
                <span className="block whitespace-nowrap tabular-nums text-aegis-gray">
                  {display}
                </span>
              );
            }
            return (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="block whitespace-nowrap tabular-nums text-aegis-gray hover:text-emerald-600"
                title="Open WhatsApp chat"
              >
                {display}
              </a>
            );
          },
        },
        {
          header: 'Email',
          sortKey: 'email',
          cell: (r) => {
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
        { header: '', cell: (r) => <AnalystRowActions row={r} /> },
      ]}
    />
  );
}
