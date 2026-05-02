import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import FilterTabs from '@/components/ui/filter-tabs';
import type { ActionItem, Meeting } from '@/lib/types';
import { displayCompany } from '@/lib/display-format';
import NewMeeting from './new-meeting';
import MeetingRowActions from './row-actions';

type MeetingRow = Meeting & {
  clients: { corporate_name: string } | null;
  analysts: { institution_name: string } | null;
  meeting_attendees: { user_id: string }[];
  action_items: ActionItem[];
};

const PAGE_SIZE = 25;
const SORTABLE = new Set(['meeting_date', 'meeting_format', 'meeting_type', 'created_at']);

export default async function MeetingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string; format?: string; type?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const format = params.format;
  const type = params.type;
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'meeting_date';
  const dir: 'asc' | 'desc' = params.dir === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();
  const [meetingsRes, clientsRes, analystsRes, profilesRes] = await Promise.all([
    (async () => {
      let query = supabase
        .from('meetings')
        .select(
          '*, clients ( corporate_name ), analysts ( institution_name ), meeting_attendees ( user_id ), action_items ( * )',
          { count: 'exact' },
        );
      if (q) query = query.or(`location.ilike.%${q}%,summary.ilike.%${q}%,other_remarks.ilike.%${q}%`);
      if (format === 'physical' || format === 'online') query = query.eq('meeting_format', format);
      if (type === 'internal' || type === 'briefing') query = query.eq('meeting_type', type);
      query = query.order(sort, { ascending: dir === 'asc' });
      query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
      return query;
    })(),
    supabase.from('clients').select('client_id, corporate_name').order('corporate_name'),
    supabase.from('analysts').select('investor_id, institution_name').order('institution_name'),
    supabase
      .from('profiles')
      .select('user_id, email, display_name, avatar_url, username, gmail_address, contact_number, role, birthday')
      .order('display_name'),
  ]);

  const rows = (meetingsRes.data ?? []) as MeetingRow[];
  const clientsList = clientsRes.data ?? [];
  const analystsList = analystsRes.data ?? [];
  const profilesList = profilesRes.data ?? [];
  const total = meetingsRes.count ?? 0;
  const error = meetingsRes.error;
  const sortState: SortState = { sort, dir };

  return (
    <div>
      <PageHeader
        title="Meeting Minutes & Engagement Mapping"
        description="Internal team meetings and client / investor briefings."
        action={<NewMeeting clients={clientsList} analysts={analystsList} profiles={profilesList} />}
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search location, summary, remarks…" />
        <FilterTabs
          paramName="type"
          options={[
            { value: '', label: 'All types' },
            { value: 'internal', label: 'Internal' },
            { value: 'briefing', label: 'Briefing' },
          ]}
        />
        <FilterTabs
          paramName="format"
          options={[
            { value: '', label: 'All formats' },
            { value: 'physical', label: 'Physical' },
            { value: 'online', label: 'Online' },
          ]}
        />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<MeetingRow>
        rows={rows}
        sortState={sortState}
        emptyMessage={q || format || type ? 'No meetings match the current filter.' : 'No meetings logged.'}
        columns={[
          {
            header: 'Date',
            sortKey: 'meeting_date',
            cell: (r) => (
              <Link
                href={`/meetings/${r.meeting_id}`}
                className="tabular-nums font-medium text-aegis-navy hover:text-aegis-orange"
              >
                {new Date(r.meeting_date).toLocaleString(undefined, {
                  dateStyle: 'medium', timeStyle: 'short',
                })}
              </Link>
            ),
          },
          {
            header: 'Type',
            sortKey: 'meeting_type',
            cell: (r) => (
              <span
                className={[
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset',
                  r.meeting_type === 'internal'
                    ? 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30'
                    : 'bg-aegis-navy-50 text-aegis-navy ring-aegis-navy/20',
                ].join(' ')}
              >
                {r.meeting_type}
              </span>
            ),
          },
          {
            header: 'Format',
            sortKey: 'meeting_format',
            cell: (r) => (
              <span className="text-xs capitalize text-aegis-gray-500">{r.meeting_format}</span>
            ),
          },
          {
            header: 'Linked',
            cell: (r) => {
              const linked = [
                r.clients?.corporate_name
                  ? displayCompany(r.clients.corporate_name)
                  : null,
                r.analysts?.institution_name
                  ? displayCompany(r.analysts.institution_name)
                  : null,
              ]
                .filter(Boolean)
                .join(' × ');
              return linked || <span className="text-aegis-gray-300">—</span>;
            },
          },
          {
            header: 'Action items',
            cell: (r) => {
              const open = r.action_items.filter((a) => a.status === 'open').length;
              const total = r.action_items.length;
              if (total === 0) return <span className="text-aegis-gray-300">—</span>;
              return (
                <span className="text-xs tabular-nums text-aegis-gray-500">
                  <span className={open > 0 ? 'font-medium text-aegis-navy' : ''}>{open}</span> / {total} open
                </span>
              );
            },
          },
          {
            header: '',
            cell: (r) => (
              <MeetingRowActions
                row={r}
                attendeeUserIds={r.meeting_attendees.map((a) => a.user_id)}
                actionItems={r.action_items}
                clients={clientsList}
                analysts={analystsList}
                profiles={profilesList}
              />
            ),
          },
        ]}
      />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
