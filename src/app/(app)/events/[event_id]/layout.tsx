import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Breadcrumbs, DetailHeader } from '@/components/detail-shell';
import { displayCompany, displayName } from '@/lib/display-format';
import {
  EVENT_STATUS_LABEL,
  type EventRow,
  type EventStatus,
} from '@/lib/types';
import EditEventButton from './edit-event-button';
import EventStatusSelect from './event-status-select';
import EventSubtabs from './event-subtabs';

const STATUS_BADGE: Record<EventStatus, string> = {
  planned: 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
  ongoing: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200 line-through',
};

// Layout for any /events/[event_id]/* route. Renders the breadcrumbs,
// detail header, and the Overview / Seating tab strip — then drops the
// nested page in below. Splitting like this lets the seating tools live
// at /events/[event_id]/seating without duplicating header chrome.
//
// Each child page re-fetches whatever data it needs. The layout fetches
// the minimum needed for the header (event row + linked client), so this
// duplicates a single SELECT against `events` per request — acceptable
// for the clarity it buys.
export default async function EventLayout({
  params,
  children,
}: {
  params: Promise<{ event_id: string }>;
  children: React.ReactNode;
}) {
  const { event_id } = await params;
  const supabase = await createClient();

  const [eventRes, clientsRes] = await Promise.all([
    supabase
      .from('events')
      .select('*, clients ( client_id, corporate_name )')
      .eq('event_id', event_id)
      .maybeSingle(),
    supabase
      .from('clients')
      .select('client_id, corporate_name')
      .order('corporate_name', { ascending: true }),
  ]);

  if (!eventRes.data) notFound();

  const event = eventRes.data as EventRow & {
    clients: { client_id: string; corporate_name: string } | null;
  };
  const clients = (clientsRes.data ?? []) as {
    client_id: string;
    corporate_name: string;
  }[];

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: '/events', label: 'Events' },
          { label: displayName(event.name) },
        ]}
      />
      <DetailHeader
        title={displayName(event.name)}
        subtitle={
          event.clients ? (
            <>
              For{' '}
              <Link
                href={`/clients/${event.clients.client_id}`}
                className="font-medium text-aegis-navy hover:text-aegis-orange"
              >
                {displayCompany(event.clients.corporate_name)}
              </Link>
            </>
          ) : event.adhoc_client_name ? (
            <>
              For{' '}
              <span className="font-medium text-aegis-gray">
                {displayCompany(event.adhoc_client_name)}
              </span>
              <span className="ml-2 inline-flex rounded-full bg-aegis-gray-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-aegis-gray-500">
                ad-hoc
              </span>
            </>
          ) : null
        }
        badges={
          <span
            className={[
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset',
              STATUS_BADGE[event.status],
            ].join(' ')}
          >
            {EVENT_STATUS_LABEL[event.status]}
          </span>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <EventStatusSelect eventId={event.event_id} status={event.status} />
            <EditEventButton row={event} clients={clients} />
          </div>
        }
      />

      <EventSubtabs eventId={event.event_id} />

      {children}
    </div>
  );
}
