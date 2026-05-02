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
  type EventGuestCheckin,
  type EventRow,
  type EventStatus,
} from '@/lib/types';
import { displayCompany, displayName } from '@/lib/display-format';
import EditEventButton from './edit-event-button';
import EventStatusSelect from './event-status-select';
import GuestList from './guest-list';

export type CheckinFeedEntry = EventGuestCheckin & {
  guest_name: string | null;
  guest_company: string | null;
  performed_by_label: string | null;
};

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

  const { data: { user } } = await supabase.auth.getUser();

  const [eventRes, guestsRes, clientsRes, activityRes, googleRes] = await Promise.all([
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
    // Last 50 check-in audit rows for this event, joined with the guest's
    // name (so we don't have to look it up client-side) and the staff member's
    // display name. Newest first — drives the "Recent activity" feed.
    supabase
      .from('event_guest_checkins')
      .select(
        'checkin_id, guest_id, event_id, action, source, performed_by_user_id, performed_at, notes,'
          + ' event_guests ( full_name, company ),'
          + ' profiles:performed_by_user_id ( display_name, email )',
      )
      .eq('event_id', event_id)
      .order('performed_at', { ascending: false })
      .limit(50),
    user
      ? supabase
          .from('google_connections')
          .select('google_email')
          .eq('user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null } as const),
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

  const activity: CheckinFeedEntry[] = (
    (activityRes.data ?? []) as unknown as Array<
      EventGuestCheckin & {
        event_guests: { full_name: string; company: string | null } | null;
        profiles: { display_name: string | null; email: string } | null;
      }
    >
  ).map((row) => ({
    checkin_id: row.checkin_id,
    guest_id: row.guest_id,
    event_id: row.event_id,
    action: row.action,
    source: row.source,
    performed_by_user_id: row.performed_by_user_id,
    performed_at: row.performed_at,
    notes: row.notes,
    guest_name: row.event_guests?.full_name ?? null,
    guest_company: row.event_guests?.company ?? null,
    performed_by_label:
      row.profiles?.display_name?.trim() ||
      row.profiles?.email ||
      null,
  }));

  const googleConnection = (googleRes.data as { google_email: string } | null) ?? null;

  const total = guests.length;
  const checkedIn = guests.filter((g) => g.checked_in).length;

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
              For <span className="font-medium text-aegis-gray">{displayCompany(event.adhoc_client_name)}</span>
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

      <GuestList
        eventId={event.event_id}
        eventName={event.name}
        guests={guests}
        activity={activity}
        googleSheetId={
          (event as unknown as { google_sheet_id: string | null })
            .google_sheet_id ?? null
        }
        googleConnected={googleConnection !== null}
        googleEmail={googleConnection?.google_email ?? null}
      />
    </div>
  );
}
