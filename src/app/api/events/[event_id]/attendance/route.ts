import { createClient } from '@/lib/supabase/server';
import { csvEscape } from '@/lib/csv';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ event_id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { event_id } = await params;

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('name, event_date, adhoc_client_name, clients ( corporate_name )')
    .eq('event_id', event_id)
    .maybeSingle();
  if (eventErr) return new Response(`Database error: ${eventErr.message}`, { status: 500 });
  if (!event) return new Response('Event not found', { status: 404 });

  const { data: guests, error: guestErr } = await supabase
    .from('event_guests')
    .select(
      'full_name, title, company, contact_number, email, checked_in, checked_in_at, notes',
    )
    .eq('event_id', event_id)
    .order('full_name', { ascending: true });
  if (guestErr) return new Response(`Database error: ${guestErr.message}`, { status: 500 });

  const headers = [
    'full_name',
    'title',
    'company',
    'contact_number',
    'email',
    'checked_in',
    'checked_in_at',
    'notes',
  ] as const;

  const lines = [headers.join(',')];
  for (const g of guests ?? []) {
    lines.push(
      [
        csvEscape((g.full_name as string) ?? ''),
        csvEscape((g.title as string | null) ?? ''),
        csvEscape((g.company as string | null) ?? ''),
        csvEscape((g.contact_number as string | null) ?? ''),
        csvEscape((g.email as string | null) ?? ''),
        g.checked_in ? 'true' : 'false',
        csvEscape((g.checked_in_at as string | null) ?? ''),
        csvEscape((g.notes as string | null) ?? ''),
      ].join(','),
    );
  }
  // UTF-8 BOM so Excel auto-detects encoding.
  const csv = '﻿' + lines.join('\r\n') + '\r\n';

  // Build a friendly filename: event name + date.
  const safeName = (event.name as string)
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'event';
  const stamp = new Date(event.event_date as string).toISOString().slice(0, 10);

  return new Response(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="attendance-${safeName}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
