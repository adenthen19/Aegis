import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Field, FieldGrid, Section } from '@/components/detail-shell';
import {
  type EventGuest,
  type EventGuestCheckin,
  type EventRow,
  type EventTable,
} from '@/lib/types';
import { formatEventDateTime } from '@/lib/display-format';
import GuestList from './guest-list';

// Overview page: event metadata + guest list (with check-in tools).
// The header/breadcrumb + Overview/Seating tab strip live in the
// shared layout. Seating moved to /events/[event_id]/seating so the
// table list and floor plan get a focused workspace separate from
// day-of check-in operations.

export type CheckinFeedEntry = EventGuestCheckin & {
  guest_name: string | null;
  guest_company: string | null;
  performed_by_label: string | null;
};

// Use the shared KL-timezone formatter so the event detail's date
// matches what the kiosk shows (and what the user actually picked
// in the form). Plain `toLocaleString` on the server runs in UTC.
const formatDateTime = (iso: string) =>
  formatEventDateTime(iso, { dateStyle: 'full', timeStyle: 'short' });

export default async function EventOverviewPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();

  const [eventRes, guestsRes, tablesRes, activityRes, googleRes] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('event_id', event_id)
      .maybeSingle(),
    supabase
      .from('event_guests')
      .select('*')
      .eq('event_id', event_id)
      .order('checked_in', { ascending: true })
      .order('full_name', { ascending: true }),
    // Tables feed the visual TablePicker on the Add / Edit guest
    // modals — fetched here even though the seating sub-page has its
    // own fetch, since /events/[id] (Overview) can't reach into the
    // sub-route's data.
    supabase
      .from('event_tables')
      .select('*')
      .eq('event_id', event_id),
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

  const event = eventRes.data as EventRow;
  const guests = (guestsRes.data ?? []) as EventGuest[];
  const tables = (tablesRes.data ?? []) as EventTable[];

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
    <>
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
        tables={tables}
        defaultCapacity={event.default_table_capacity ?? null}
        activity={activity}
        googleSheetId={
          (event as unknown as { google_sheet_id: string | null })
            .google_sheet_id ?? null
        }
        googleConnected={googleConnection !== null}
        googleEmail={googleConnection?.google_email ?? null}
      />
    </>
  );
}
