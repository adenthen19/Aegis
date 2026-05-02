import path from 'node:path';
import fs from 'node:fs/promises';
import { renderToBuffer } from '@react-pdf/renderer';
import { createClient } from '@/lib/supabase/server';
import { EventAttendancePdf } from '@/lib/pdf/event-attendance-pdf';
import type { EventGuest } from '@/lib/types';

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
      'event_id, name, event_date, location, description, adhoc_client_name, clients ( corporate_name )',
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

  const clientLabel =
    (
      (event as unknown as {
        clients: { corporate_name: string } | null;
      }).clients?.corporate_name
    ) ??
    ((event.adhoc_client_name as string | null) ?? null);

  const generatedAt = new Date().toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const logo = await loadLogo();

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
      generatedAt,
      generatedBy: user.email ?? 'Aegis',
      logo,
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
