import { createClient } from '@/lib/supabase/server';
import { csvEscape } from '@/lib/csv';
import {
  applyExportFilter,
  parseExportFilter,
} from '@/lib/event-export-filter';
import type { EventGuest } from '@/lib/types';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ event_id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { event_id } = await params;
  const filter = parseExportFilter(req.url);

  const { data: event, error: eventErr } = await supabase
    .from('events')
    .select('name, event_date, adhoc_client_name, clients ( corporate_name )')
    .eq('event_id', event_id)
    .maybeSingle();
  if (eventErr) return new Response(`Database error: ${eventErr.message}`, { status: 500 });
  if (!event) return new Response('Event not found', { status: 404 });

  // Pull the full guest row so the shared filter helper has tier + table
  // available; we only emit the export columns below.
  const { data: guests, error: guestErr } = await supabase
    .from('event_guests')
    .select('*')
    .eq('event_id', event_id)
    .order('full_name', { ascending: true });
  if (guestErr) return new Response(`Database error: ${guestErr.message}`, { status: 500 });

  const filtered = applyExportFilter((guests ?? []) as EventGuest[], filter);

  const headers = [
    'full_name',
    'title',
    'company',
    'contact_number',
    'email',
    'table_number',
    'tier',
    'checked_in',
    'checked_in_at',
    'notes',
  ] as const;

  const lines = [headers.join(',')];
  for (const g of filtered) {
    lines.push(
      [
        csvEscape(g.full_name ?? ''),
        csvEscape(g.title ?? ''),
        csvEscape(g.company ?? ''),
        csvEscape(g.contact_number ?? ''),
        csvEscape(g.email ?? ''),
        csvEscape(g.table_number ?? ''),
        csvEscape(g.tier ?? ''),
        g.checked_in ? 'true' : 'false',
        csvEscape(g.checked_in_at ?? ''),
        csvEscape(g.notes ?? ''),
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
