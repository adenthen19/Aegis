'use client';

import Link from 'next/link';
import DataTableSelectable, {
  type BulkAction,
  type SortState,
} from '@/components/data-table-selectable';
import type { MediaContact } from '@/lib/types';
import { whatsAppUrl } from '@/lib/contact-helpers';
import WhatsAppIcon from '@/components/whatsapp-icon';
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
              {r.full_name}
            </Link>
          ),
        },
        {
          header: 'Company',
          sortKey: 'company_name',
          cell: (r) => r.company_name ?? <span className="text-aegis-gray-300">—</span>,
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
            const wa = whatsAppUrl(r.contact_number);
            if (!wa) {
              return <span className="tabular-nums text-aegis-gray">{r.contact_number}</span>;
            }
            return (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 tabular-nums text-aegis-gray hover:text-emerald-600"
                title="Open WhatsApp chat"
              >
                <WhatsAppIcon />
                {r.contact_number}
              </a>
            );
          },
        },
        {
          header: 'Email',
          sortKey: 'email',
          cell: (r) =>
            r.email ? (
              <a
                href={`mailto:${r.email}`}
                className="text-aegis-navy hover:text-aegis-orange"
              >
                {r.email}
              </a>
            ) : (
              <span className="text-aegis-gray-300">—</span>
            ),
        },
        { header: '', cell: (r) => <MediaRowActions row={r} /> },
      ]}
    />
  );
}
