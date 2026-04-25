import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import type { Analyst } from '@/lib/types';
import NewAnalyst from './new-analyst';
import AnalystRowActions from './row-actions';

const PAGE_SIZE = 25;
const SORTABLE = new Set(['full_name', 'institution_name', 'analyst_type', 'email', 'created_at']);

export default async function AnalystsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'institution_name';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();
  let query = supabase.from('analysts').select('*', { count: 'exact' });
  if (q) {
    query = query.or(
      `full_name.ilike.%${q}%,institution_name.ilike.%${q}%,email.ilike.%${q}%`,
    );
  }
  query = query.order(sort, { ascending: dir === 'asc' });
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const rows = (data ?? []) as Analyst[];
  const total = count ?? 0;
  const sortState: SortState = { sort, dir };

  return (
    <div>
      <PageHeader
        title="Analyst & Fund Manager Database"
        description="Buy-side and sell-side coverage contacts."
        action={<NewAnalyst />}
      />

      <div className="mb-4">
        <SearchInput placeholder="Search by name, institution, or email…" />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<Analyst>
        rows={rows}
        sortState={sortState}
        emptyMessage={q ? `No analysts matching "${q}".` : 'No analysts yet.'}
        columns={[
          {
            header: 'Name',
            sortKey: 'full_name',
            cell: (r) => (
              <Link
                href={`/analysts/${r.investor_id}`}
                className="font-medium text-aegis-navy hover:text-aegis-orange"
              >
                {r.full_name ?? <span className="text-aegis-gray-300">—</span>}
              </Link>
            ),
          },
          {
            header: 'Institution',
            sortKey: 'institution_name',
            cell: (r) => r.institution_name,
          },
          {
            header: 'Type',
            sortKey: 'analyst_type',
            cell: (r) => (
              <span
                className={[
                  'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset',
                  r.analyst_type === 'buy_side'
                    ? 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20'
                    : 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
                ].join(' ')}
              >
                {r.analyst_type === 'buy_side' ? 'Buy-side' : 'Sell-side'}
              </span>
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
          { header: '', cell: (r) => <AnalystRowActions row={r} /> },
        ]}
      />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
