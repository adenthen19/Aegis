import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import { type SortState } from '@/components/data-table';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import type { Analyst } from '@/lib/types';
import NewAnalyst from './new-analyst';
import ExportAnalystEmails from './export-emails';
import ImportAnalysts from './import-analysts';
import AnalystsList from './analysts-list';

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
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <ExportAnalystEmails />
            <ImportAnalysts />
            <NewAnalyst />
          </div>
        }
      />

      <div className="mb-4">
        <SearchInput placeholder="Search by name, institution, or email…" />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <AnalystsList
        rows={rows}
        sortState={sortState}
        emptyMessage={q ? `No analysts matching "${q}".` : 'No analysts yet.'}
      />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
