import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUserWithRole } from '@/lib/auth';
import type { EventGuest, EventRow, EventTable } from '@/lib/types';
import KioskShell from './kiosk-shell';

export const metadata = {
  title: 'Check-in kiosk · Aegis',
};

export default async function KioskPage({
  params,
}: {
  params: Promise<{ event_id: string }>;
}) {
  const { event_id } = await params;
  const supabase = await createClient();

  const me = await getCurrentUserWithRole();
  if (!me) redirect(`/login?next=/kiosk/${event_id}`);

  const [eventRes, guestsRes, tablesRes] = await Promise.all([
    supabase
      .from('events')
      .select(
        '*, clients ( client_id, corporate_name, logo_url )',
      )
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
  ]);

  if (!eventRes.data) notFound();

  const event = eventRes.data as EventRow & {
    clients: {
      client_id: string;
      corporate_name: string;
      logo_url: string | null;
    } | null;
    google_sheet_id: string | null;
  };
  const guests = (guestsRes.data ?? []) as EventGuest[];
  const tables = (tablesRes.data ?? []) as EventTable[];

  const clientLabel =
    event.clients?.corporate_name ?? event.adhoc_client_name ?? null;
  const clientLogoUrl = event.clients?.logo_url ?? null;

  return (
    <KioskShell
      eventId={event.event_id}
      eventName={event.name}
      eventDate={event.event_date}
      clientLabel={clientLabel}
      clientLogoUrl={clientLogoUrl}
      location={event.location}
      guests={guests}
      tables={tables}
      defaultCapacity={event.default_table_capacity ?? null}
      requiresWalkInApproval={!!event.requires_walkin_approval}
      googleSheetId={event.google_sheet_id ?? null}
      userRole={me.role}
    />
  );
}
