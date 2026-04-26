import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import type { MediaContact } from '@/lib/types';
import NewMediaContact from './new-media-contact';
import MediaRowActions from './row-actions';
import ExportMediaEmails from './export-emails';

const PAGE_SIZE = 25;
const SORTABLE = new Set(['full_name', 'company_name', 'state', 'email', 'created_at']);

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'full_name';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();
  let query = supabase.from('media_contacts').select('*', { count: 'exact' });
  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,company_name.ilike.%${q}%,email.ilike.%${q}%,state.ilike.%${q}%`,
    );
  }
  query = query.order(sort, { ascending: dir === 'asc' });
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const rows = (data ?? []) as MediaContact[];
  const total = count ?? 0;
  const sortState: SortState = { sort, dir };

  return (
    <div>
      <PageHeader
        title="Media Contacts"
        description="Journalists and media stakeholders."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <ExportMediaEmails />
            <NewMediaContact />
          </div>
        }
      />

      <div className="mb-4">
        <SearchInput placeholder="Search by name, company, state, or email…" />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<MediaContact>
        rows={rows}
        sortState={sortState}
        emptyMessage={q ? `No contacts matching "${q}".` : 'No media contacts yet.'}
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
            cell: (r) =>
              r.contact_number ? (
                <a
                  href={`tel:${r.contact_number.replace(/\s+/g, '')}`}
                  className="tabular-nums text-aegis-gray hover:text-aegis-navy"
                >
                  {r.contact_number}
                </a>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
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

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
