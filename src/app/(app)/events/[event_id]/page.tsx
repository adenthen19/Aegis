import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import {
  Breadcrumbs,
  DetailHeader,
  Field,
  FieldGrid,
  Section,
} from '@/components/detail-shell';
import {
  EVENT_STATUS_LABEL,
  type EventGuest,
  type EventRow,
  type EventStatus,
} from '@/lib/types';
import EditEventButton from './edit-event-button';
import EventStatusSelect from './event-status-select';
import GuestList from './guest-list';

const STATUS_BADGE: Record<EventStatus, string> = {
  planned: 'bg-aegis-gray-50 text-aegis-gray ring-aegis-gray-200',
  ongoing: 'bg-aegis-blue-50 text-aegis-navy ring-aegis-blue/30',
  completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  cancelled: 'bg-aegis-gray-50 text-aegis-gray-300 ring-aegis-gray-200 line-through',
};

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'full',
    timeStyle: 'short',
  });
}

export default async function EventDetailPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id } = await params;
  const supabase = await createClient();

  const [eventRes, guestsRes, clientsRes] = await Promise.all([
    supabase
      .from('events')
      .select('*, clients ( client_id, corporate_name )')
      .eq('event_id', event_id)
      .maybeSingle(),
    supabase
      .from('event_guests')
      .select('*')
      .eq('event_id', event_id)
      .order('checked_in', { ascending: true })
      .order('full_name', { ascending: true }),
    supabase
      .from('clients')
      .select('client_id, corporate_name')
      .order('corporate_name', { ascending: true }),
  ]);

  if (!eventRes.data) notFound();

  const event = eventRes.data as EventRow & {
    clients: { client_id: string; corporate_name: string } | null;
  };
  const guests = (guestsRes.data ?? []) as EventGuest[];
  const clients = (clientsRes.data ?? []) as {
    client_id: string;
    corporate_name: string;
  }[];

  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;

  return (
    <div>
      <Breadcrumbs
        items={[
          { href: '/events', label: 'Events' },
          { label: event.name },
        ]}
      />
      <DetailHeader
        title={event.name}
        subtitle={
          event.clients ? (
            <>
              For{' '}
              <Link
                href={`/clients/${event.clients.client_id}`}
                className="font-medium text-aegis-navy hover:text-aegis-orange"
              >
                {event.clients.corporate_name}
              </Link>
            </>
          ) : event.adhoc_client_name ? (
            <>
              For <span className="font-medium text-aegis-gray">{event.adhoc_client_name}</span>
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

      <Section title="Event details">
        <FieldGrid>
          <Field label="Date & time">{formatDateTime(event.event_date)}</Field>
          <Field label="Location">{event.location || '—'}</Field>
          <Field label="Total guests">
            <span className="tabular-nums">{total}</span>
          </Field>
          <Field label="Attendance">
            <span className="tabular-nums">
              <span className="font-medium text-aegis-navy">{checkedIn}</span>
              <span className="text-aegis-gray-300"> / {total}</span>
              {total > 0 && (
                <span className="ml-1.5 text-[11px] text-aegis-gray-500">
                  ({Math.round((checkedIn / total) * 100)}%)
                </span>
              )}
            </span>
          </Field>
        </FieldGrid>
        {event.description && (
          <div className="mt-5">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-aegis-gray-500">
              Description
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-aegis-gray">
              {event.description}
            </p>
          </div>
        )}
      </Section>

      <GuestList eventId={event.event_id} guests={guests} />
    </div>
  );
}
