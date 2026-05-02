import path from 'node:path';
import fs from 'node:fs/promises';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import {
  EventAttendancePdf,
  type CheckinAuditEntry,
} from '@/lib/pdf/event-attendance-pdf';
import type { EventGuest, EventGuestCheckin } from '@/lib/types';

// React-PDF needs Node APIs (fs, stream, fonts) — keep this off the Edge.
export const runtime = 'nodejs';

// Cache the brand logo bytes across requests so the second request doesn't
// re-read from disk. Read lazily so a missing file doesn't crash module init.
let cachedLogo: Buffer | null | undefined;

async function loadLogo(): Promise<Buffer | null> {
  if (cachedLogo !== undefined) return cachedLogo;
  try {
    const file = path.join(process.cwd(), 'public', 'aegis_logo.png');
    cachedLogo = await fs.readFile(file);
  } catch {
    cachedLogo = null;
  }
  return cachedLogo;
}

// Fetches the client logo from its Supabase Storage URL. Returns null on any
// network / size / type problem so the PDF still renders without a client mark
// rather than failing the whole report.
async function fetchClientLogo(url: string | null): Promise<Buffer | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const ab = await res.arrayBuffer();
    // Hard cap so a misconfigured logo can't blow up PDF memory.
    if (ab.byteLength > 2 * 1024 * 1024) return null;
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

function safeFilename(name: string): string {
  return (
    name
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 40) || 'event'
  );
}

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
    .select(
      'event_id, name, event_date, location, description, adhoc_client_name, clients ( corporate_name, logo_url )',
    )
    .eq('event_id', event_id)
    .maybeSingle();
  if (eventErr) return new Response(`Database error: ${eventErr.message}`, { status: 500 });
  if (!event) return new Response('Event not found', { status: 404 });

  const { data: guests, error: guestsErr } = await supabase
    .from('event_guests')
    .select('*')
    .eq('event_id', event_id);
  if (guestsErr) return new Response(`Database error: ${guestsErr.message}`, { status: 500 });

  // Audit log — full history, sorted oldest → newest in the report so the
  // client can read it as a timeline. We include every entry; for very long
  // events the table just spills onto more pages.
  const { data: auditRaw } = await supabase
    .from('event_guest_checkins')
    .select(
      'performed_at, action, source,'
        + ' event_guests ( full_name, company ),'
        + ' profiles:performed_by_user_id ( display_name, email )',
    )
    .eq('event_id', event_id)
    .order('performed_at', { ascending: true });

  const audit: CheckinAuditEntry[] = (
    (auditRaw ?? []) as unknown as Array<
      Pick<EventGuestCheckin, 'performed_at' | 'action' | 'source'> & {
        event_guests: { full_name: string; company: string | null } | null;
        profiles: { display_name: string | null; email: string } | null;
      }
    >
  ).map((row) => ({
    performed_at: row.performed_at,
    action: row.action,
    source: row.source,
    guest_name: row.event_guests?.full_name ?? null,
    guest_company: row.event_guests?.company ?? null,
    performed_by_label:
      row.profiles?.display_name?.trim() ||
      row.profiles?.email ||
      null,
  }));

  const clientRow = (
    event as unknown as {
      clients: { corporate_name: string; logo_url: string | null } | null;
    }
  ).clients;

  const clientLabel =
    clientRow?.corporate_name ??
    ((event.adhoc_client_name as string | null) ?? null);
  const clientLogoUrl = clientRow?.logo_url ?? null;

  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const [logo, clientLogo] = await Promise.all([
    loadLogo(),
    fetchClientLogo(clientLogoUrl),
  ]);

  const buffer = await renderToBuffer(
    EventAttendancePdf({
      event: {
        name: event.name as string,
        event_date: event.event_date as string,
        location: (event.location as string | null) ?? null,
        description: (event.description as string | null) ?? null,
        clientLabel,
      },
      guests: (guests ?? []) as EventGuest[],
      audit,
      generatedAt,
      generatedBy: user.email ?? 'Aegis',
      logo,
      clientLogo,
    }),
  );

  const stamp = new Date(event.event_date as string).toISOString().slice(0, 10);
  const filename = `attendance-${safeFilename(event.name as string)}-${stamp}.pdf`;

  return new Response(new Uint8Array(buffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
