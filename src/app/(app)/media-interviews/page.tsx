import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import FilterTabs from '@/components/ui/filter-tabs';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import {
  INTERVIEW_FORMAT_LABEL,
  INTERVIEW_STATUS_LABEL,
  type InterviewStatus,
  type MediaInterview,
} from '@/lib/types';

const PAGE_SIZE = 25;
const SORTABLE = new Set(['interview_date', 'status', 'created_at']);
const STATUSES: InterviewStatus[] = ['scheduled', 'completed', 'cancelled', 'postponed'];

const STATUS_BADGE: Record<InterviewStatus, string> = {
  scheduled: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-red-50 text-red-700 ring-red-200',
  postponed: 'bg-amber-50 text-amber-700 ring-amber-200',
};

type Row = MediaInterview & {
  clients: { client_id: string; corporate_name: string } | null;
  media_contacts: { full_name: string; company_name: string | null } | null;
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function outletLabel(row: Row): string {
  if (row.media_contacts) {
    const c = row.media_contacts;
    return c.company_name ? `${c.full_name} · ${c.company_name}` : c.full_name;
  }
  return row.publication_name ?? '—';
}

export default async function MediaInterviewsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const status = STATUSES.includes(params.status as InterviewStatus)
    ? (params.status as InterviewStatus)
    : '';
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'interview_date';
  const dir: 'asc' | 'desc' = params.dir === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();

  let query = supabase
    .from('media_interviews')
    .select(
      '*, clients ( client_id, corporate_name ), media_contacts ( full_name, company_name )',
      { count: 'exact' },
    );

  if (q) {
    query = query.or(
      `publication_name.ilike.%${q}%,reporter_name.ilike.%${q}%,topic.ilike.%${q}%,spokesperson_name.ilike.%${q}%`,
    );
  }
  if (status) query = query.eq('status', status);
  query = query.order(sort, { ascending: dir === 'asc' });
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const rows = (data ?? []) as Row[];
  const total = count ?? 0;
  const sortState: SortState = { sort, dir };

  return (
    <div>
      <PageHeader
        title="Media Interviews"
        description="Every one-on-one between a client spokesperson and a journalist — across the book."
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search by publication, reporter, topic…" />
        <FilterTabs
          paramName="status"
          options={[
            { value: '', label: 'All' },
            ...STATUSES.map((s) => ({ value: s, label: INTERVIEW_STATUS_LABEL[s] })),
          ]}
        />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<Row>
        rows={rows}
        sortState={sortState}
        emptyMessage={
          q
            ? `No interviews matching "${q}".`
            : status
              ? `No ${INTERVIEW_STATUS_LABEL[status as InterviewStatus].toLowerCase()} interviews.`
              : 'No interviews logged yet.'
        }
        columns={[
          {
            header: 'Date',
            sortKey: 'interview_date',
            cell: (r) => (
              <span className="text-xs tabular-nums text-aegis-gray">
                {formatDateTime(r.interview_date)}
              </span>
            ),
          },
          {
            header: 'Client',
            cell: (r) =>
              r.clients ? (
                <Link
                  href={`/clients/${r.clients.client_id}`}
                  className="block truncate font-medium text-aegis-navy hover:text-aegis-orange"
                >
                  {r.clients.corporate_name}
                </Link>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Media',
            cell: (r) => (
              <span className="text-xs text-aegis-gray">{outletLabel(r)}</span>
            ),
          },
          {
            header: 'Reporter',
            cell: (r) =>
              r.reporter_name ? (
                <span className="text-xs text-aegis-gray">{r.reporter_name}</span>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Topic',
            cell: (r) =>
              r.topic ? (
                <span className="line-clamp-1 text-xs text-aegis-gray">{r.topic}</span>
              ) : (
                <span className="text-aegis-gray-300">—</span>
              ),
          },
          {
            header: 'Format',
            cell: (r) => (
              <span className="text-[10px] uppercase tracking-wide text-aegis-gray-500">
                {INTERVIEW_FORMAT_LABEL[r.interview_format]}
              </span>
            ),
          },
          {
            header: 'Status',
            sortKey: 'status',
            cell: (r) => (
              <span
                className={[
                  'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset',
                  STATUS_BADGE[r.status],
                ].join(' ')}
              >
                {INTERVIEW_STATUS_LABEL[r.status]}
              </span>
            ),
          },
        ]}
      />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
