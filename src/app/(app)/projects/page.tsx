import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import FilterTabs from '@/components/ui/filter-tabs';
import type { Project, ProjectStatus } from '@/lib/types';
import NewProject from './new-project';
import ProjectRowActions from './row-actions';

type ProjectRow = Project & { clients: { corporate_name: string } | null };

const PAGE_SIZE = 25;
const SORTABLE = new Set(['deliverable_name', 'status', 'deadline', 'created_at']);

const STATUS_STYLES: Record<ProjectStatus, string> = {
  pending: 'bg-aegis-gold-50 text-aegis-gray-700 ring-aegis-gold/40',
  upcoming: 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20',
  completed: 'bg-aegis-gray-50 text-aegis-gray-500 ring-aegis-gray-200',
};
const STATUS_DOT: Record<ProjectStatus, string> = {
  pending: 'bg-aegis-gold',
  upcoming: 'bg-aegis-blue',
  completed: 'bg-aegis-gray-300',
};

function deadlineCell(deadline: string | null, status: ProjectStatus) {
  if (!deadline) return <span className="text-aegis-gray-300">—</span>;
  const d = new Date(deadline);
  const overdue = status !== 'completed' && d.getTime() < Date.now();
  return (
    <span className={overdue ? 'font-medium text-aegis-orange-600' : 'text-aegis-gray'}>
      {d.toLocaleDateString()}
      {overdue && <span className="ml-1.5 text-xs font-normal">· overdue</span>}
    </span>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const status = params.status;
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'deadline';
  const dir: 'asc' | 'desc' = params.dir === 'desc' ? 'desc' : 'asc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();
  const [projectsRes, clientsRes] = await Promise.all([
    (async () => {
      let query = supabase.from('projects')
        .select('*, clients ( corporate_name )', { count: 'exact' });
      if (q) query = query.ilike('deliverable_name', `%${q}%`);
      if (status === 'pending' || status === 'upcoming' || status === 'completed') {
        query = query.eq('status', status);
      }
      query = query.order(sort, { ascending: dir === 'asc', nullsFirst: false });
      query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      return query;
    })(),
    supabase.from('clients').select('client_id, corporate_name').order('corporate_name'),
  ]);

  const rows = (projectsRes.data ?? []) as ProjectRow[];
  const clientsList = clientsRes.data ?? [];
  const total = projectsRes.count ?? 0;
  const error = projectsRes.error;
  const sortState: SortState = { sort, dir };

  return (
    <div>
      <PageHeader
        title="Project Tracking"
        description="Deliverables across all client engagements with status and deadlines."
        action={<NewProject clients={clientsList} />}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search by deliverable name…" />
        <FilterTabs
          paramName="status"
          options={[
            { value: '', label: 'All' },
            { value: 'pending', label: 'Pending' },
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'completed', label: 'Completed' },
          ]}
        />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<ProjectRow>
        rows={rows}
        sortState={sortState}
        emptyMessage={q || status ? 'No projects match the current filter.' : 'No projects yet.'}
        columns={[
          {
            header: 'Deliverable',
            sortKey: 'deliverable_name',
            cell: (r) => (
              <Link
                href={`/projects/${r.project_id}`}
                className="font-medium text-aegis-navy hover:text-aegis-orange"
              >
                {r.deliverable_name}
              </Link>
            ),
          },
          {
            header: 'Client',
            cell: (r) => r.clients?.corporate_name ?? <span className="text-aegis-gray-300">—</span>,
          },
          {
            header: 'Status',
            sortKey: 'status',
            cell: (r) => (
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[r.status]}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[r.status]}`} />
                {r.status}
              </span>
            ),
          },
          {
            header: 'Deadline',
            sortKey: 'deadline',
            cell: (r) => deadlineCell(r.deadline, r.status),
          },
          { header: '', cell: (r) => <ProjectRowActions row={r} clients={clientsList} /> },
        ]}
      />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}

