import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type {
  EventGuest,
  EventRoomMarker,
  EventRow,
  EventTable,
} from '@/lib/types';
import SeatingSection from '../seating-section';

// Dedicated seating workspace for an event. Hosts the rebuilt table list
// (grouped by section, expandable to show seated guests) and the
// floor-plan canvas. Split off from the main event detail so day-of
// check-in tools (the GuestList) and seating-management tools don't
// crowd the same scroll context.
export default async function EventSeatingPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id } = await params;
  const supabase = await createClient();

  const [eventRes, guestsRes, tablesRes, markersRes] = await Promise.all([
    supabase
      .from('events')
      .select('*')
      .eq('event_id', event_id)
      .maybeSingle(),
    supabase
      .from('event_guests')
      .select('*')
      .eq('event_id', event_id)
      .order('full_name', { ascending: true }),
    supabase
      .from('event_tables')
      .select('*')
      .eq('event_id', event_id),
    supabase
      .from('event_room_markers')
      .select('*')
      .eq('event_id', event_id),
  ]);

  if (!eventRes.data) notFound();

  const event = eventRes.data as EventRow;
  const guests = (guestsRes.data ?? []) as EventGuest[];
  const tables = (tablesRes.data ?? []) as EventTable[];
  const markers = (markersRes.data ?? []) as EventRoomMarker[];

  return (
    <SeatingSection
      eventId={event.event_id}
      defaultCapacity={event.default_table_capacity ?? null}
      tables={tables}
      guests={guests}
      markers={markers}
    />
  );
}
