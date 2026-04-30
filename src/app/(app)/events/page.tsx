import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import PageHeader from '@/components/page-header';
import DataTable, { type SortState } from '@/components/data-table';
import FilterTabs from '@/components/ui/filter-tabs';
import SearchInput from '@/components/ui/search-input';
import Pagination from '@/components/ui/pagination';
import {
  EVENT_STATUS_LABEL,
  type EventRow,
  type EventStatus,
} from '@/lib/types';
import NewEvent from './new-event';
import EventRowActions from './row-actions';

const PAGE_SIZE = 25;
const SORTABLE = new Set(['name', 'event_date', 'status', 'created_at']);
const STATUSES: EventStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];

const STATUS_BADGE: Record<EventStatus, string> = {
  planned: 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
  ongoing: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200 line-through',
};

type EventListRow = EventRow & {
  clients: { corporate_name: string } | null;
  guest_count: number;
  checked_in_count: number;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string; page?: string; status?: string }>;
}) {
  const params = await searchParams;
  const q = params.q?.trim() ?? '';
  const status = STATUSES.includes(params.status as EventStatus)
    ? (params.status as EventStatus)
    : '';
  const sort = SORTABLE.has(params.sort ?? '') ? params.sort! : 'event_date';
  const dir: 'asc' | 'desc' = params.dir === 'asc' ? 'asc' : 'desc';
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const supabase = await createClient();

  let query = supabase
    .from('events')
    .select('*, clients ( corporate_name )', { count: 'exact' });

  if (q) {
    query = query.or(
      `name.ilike.%${q}%,location.ilike.%${q}%,adhoc_client_name.ilike.%${q}%`,
    );
  }
  if (status) query = query.eq('status', status);
  query = query.order(sort, { ascending: dir === 'asc' });
  query = query.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await query;
  const baseRows = (data ?? []) as (EventRow & {
    clients: { corporate_name: string } | null;
  })[];

  // Fetch guest counts in a single round trip rather than N queries.
  const eventIds = baseRows.map((r) => r.event_id);
  const guestCounts = new Map<string, { total: number; checkedIn: number }>();
  if (eventIds.length > 0) {
    const { data: guests } = await supabase
      .from('event_guests')
      .select('event_id, checked_in')
      .in('event_id', eventIds);
    for (const g of guests ?? []) {
      const id = g.event_id as string;
      const slot = guestCounts.get(id) ?? { total: 0, checkedIn: 0 };
      slot.total += 1;
      if (g.checked_in) slot.checkedIn += 1;
      guestCounts.set(id, slot);
    }
  }
  const rows: EventListRow[] = baseRows.map((r) => {
    const c = guestCounts.get(r.event_id) ?? { total: 0, checkedIn: 0 };
    return { ...r, guest_count: c.total, checked_in_count: c.checkedIn };
  });

  // Client picker options for the New Event modal.
  const { data: clientList } = await supabase
    .from('clients')
    .select('client_id, corporate_name')
    .order('corporate_name', { ascending: true });
  const clients = (clientList ?? []) as { client_id: string; corporate_name: string }[];

  const total = count ?? 0;
  const sortState: SortState = { sort, dir };

  return (
    <div>
      <PageHeader
        title="Event Management"
        description="Plan AGMs, briefings and launches — manage guest lists, check-ins, and attendance."
        action={
          <div className="flex flex-col gap-2 sm:flex-row">
            <NewEvent clients={clients} />
          </div>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput placeholder="Search by name, location, or ad-hoc client…" />
        <FilterTabs
          paramName="status"
          options={[
            { value: '', label: 'All' },
            ...STATUSES.map((s) => ({ value: s, label: EVENT_STATUS_LABEL[s] })),
          ]}
        />
      </div>

      {error && <p className="mb-4 text-sm text-aegis-orange-600">{error.message}</p>}

      <DataTable<EventListRow>
        rows={rows}
        sortState={sortState}
        emptyMessage={
          q
            ? `No events matching "${q}".`
            : status
              ? `No ${EVENT_STATUS_LABEL[status as EventStatus].toLowerCase()} events.`
              : 'No events yet — create one to start a guest list.'
        }
        columns={[
          {
            header: 'Event',
            sortKey: 'name',
            cell: (r) => (
              <div className="min-w-0">
                <Link
                  href={`/events/${r.event_id}`}
                  className="block truncate font-medium text-aegis-navy hover:text-aegis-orange"
                >
                  {r.name}
                </Link>
                {r.location && (
                  <p className="truncate text-[11px] text-aegis-gray-500">{r.location}</p>
                )}
              </div>
            ),
          },
          {
            header: 'Client',
            cell: (r) => (
              <div className="min-w-0">
                {r.clients ? (
                  <Link
                    href={`/clients/${r.client_id}`}
                    className="truncate text-xs text-aegis-navy hover:text-aegis-orange"
                  >
                    {r.clients.corporate_name}
                  </Link>
                ) : r.adhoc_client_name ? (
                  <span className="text-xs text-aegis-gray">
                    {r.adhoc_client_name}
                    <span className="ml-1.5 inline-flex rounded-full bg-aegis-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-aegis-gray-500">
                      ad-hoc
                    </span>
                  </span>
                ) : (
                  <span className="text-aegis-gray-300">—</span>
                )}
              </div>
            ),
          },
          {
            header: 'Date',
            sortKey: 'event_date',
            cell: (r) => (
              <span className="text-xs tabular-nums text-aegis-gray">
                {formatDate(r.event_date)}
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
                {EVENT_STATUS_LABEL[r.status]}
              </span>
            ),
          },
          {
            header: 'Guests',
            cell: (r) => (
              <span className="text-xs tabular-nums text-aegis-gray">
                <span className="font-medium text-aegis-navy">{r.checked_in_count}</span>
                <span className="text-aegis-gray-300"> / {r.guest_count}</span>
                <span className="ml-1 text-[10px] uppercase tracking-wide text-aegis-gray-300">
                  checked in
                </span>
              </span>
            ),
          },
          { header: '', cell: (r) => <EventRowActions row={r} clients={clients} /> },
        ]}
      />

      <Pagination total={total} page={page} pageSize={PAGE_SIZE} />
    </div>
  );
}
