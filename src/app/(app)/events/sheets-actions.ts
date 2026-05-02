'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getValidAccessToken } from '@/lib/google/oauth';
import {
  ensureTab,
  parseSpreadsheetId,
  styleHeaderRow,
  writeRangeReplacing,
} from '@/lib/google/sheets';
import type { EventGuest } from '@/lib/types';

export type PushToSheetResult =
  | {
      ok: true;
      spreadsheet_id: string;
      sheet_url: string;
      rows_written: number;
    }
  | { ok: false; error: string };

const TAB_NAME = 'Aegis Attendance';

// Server action: write the event's guest list + check-in state to a Google
// Sheet using the calling user's Google connection. Idempotent — re-running
// clears the tab and writes fresh data, so this can be triggered repeatedly
// during a live event (think "refresh the client's view").
export async function pushAttendanceToSheetAction(
  event_id: string,
  sheet_input: string,
): Promise<PushToSheetResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const spreadsheetId = parseSpreadsheetId(sheet_input);
  if (!spreadsheetId) {
    return {
      ok: false,
      error:
        'Could not parse a spreadsheet id from the URL. Paste the full Sheets URL or just the id between /d/ and /edit.',
    };
  }

  // Pull the event + guests we'll write.
  const { data: event } = await supabase
    .from('events')
    .select('event_id, name, event_date, location, adhoc_client_name, clients ( corporate_name )')
    .eq('event_id', event_id)
    .maybeSingle();
  if (!event) return { ok: false, error: 'Event not found.' };

  const { data: guestsRaw } = await supabase
    .from('event_guests')
    .select('*')
    .eq('event_id', event_id);
  const guests = (guestsRaw ?? []) as EventGuest[];

  // Auth — pull a fresh access token for the calling user. Throws a
  // friendly error if they haven't connected.
  let accessToken: string;
  try {
    const auth = await getValidAccessToken();
    accessToken = auth.accessToken;
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Google account not connected. Visit /integrations to connect.',
    };
  }

  // Build the rows. Header row first, then one row per guest, sorted to
  // match the PDF / Excel exports (checked-in first by time, pending alpha).
  const sortedGuests = [...guests].sort((a, b) => {
    if (a.checked_in !== b.checked_in) return a.checked_in ? -1 : 1;
    if (a.checked_in && b.checked_in) {
      return (a.checked_in_at ?? '').localeCompare(b.checked_in_at ?? '');
    }
    return a.full_name.localeCompare(b.full_name);
  });

  const clientLabel =
    (event as unknown as { clients: { corporate_name: string } | null })
      .clients?.corporate_name
    ?? ((event.adhoc_client_name as string | null) ?? '');

  const total = sortedGuests.length;
  const checkedIn = sortedGuests.filter((g) => g.checked_in).length;
  const pct = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

  // Lay out a small "Summary" block at the top, then the guest table.
  // Two-row gap between blocks so the data table isn't visually glued to it.
  const summaryRows: (string | number)[][] = [
    ['Aegis Attendance Report'],
    ['Event', event.name as string],
    ['Client', clientLabel],
    ['Date', new Date(event.event_date as string).toLocaleString('en-GB')],
    ['Location', (event.location as string | null) ?? ''],
    ['Total guests', total],
    ['Checked in', checkedIn],
    ['Attendance %', `${pct}%`],
    ['Last pushed', new Date().toLocaleString('en-GB')],
    ['', ''],
    ['', ''],
  ];

  const guestHeader = [
    'Name',
    'Title',
    'Company',
    'Email',
    'Contact number',
    'Table',
    'Status',
    'Checked in at',
  ];
  const guestRows: (string | number | null)[][] = sortedGuests.map((g) => [
    g.full_name,
    g.title ?? '',
    g.company ?? '',
    g.email ?? '',
    g.contact_number ?? '',
    g.table_number ?? '',
    g.checked_in ? 'Checked in' : 'Pending',
    g.checked_in_at
      ? new Date(g.checked_in_at).toLocaleString('en-GB')
      : '',
  ]);

  const allRows: (string | number | null)[][] = [
    ...summaryRows,
    guestHeader,
    ...guestRows,
  ];

  // Write — make sure the tab exists, clear it, drop the values in, style
  // the (data-table) header row. The summary block stays unstyled which
  // signals to the reader that it's a label/value list, not a grid.
  try {
    await ensureTab(spreadsheetId, TAB_NAME, accessToken);
    await writeRangeReplacing(
      spreadsheetId,
      `${TAB_NAME}!A1`,
      allRows,
      accessToken,
    );
    // The header row index = summaryRows.length (0-indexed). We freeze and
    // colour the header *of the guest table*, not row 1, since row 1 here
    // is the report title rather than a column header.
    // (Sheets API freezes by row count from the top, so we instead style
    // just that single row and skip the freeze for the data table — the
    // top-of-document title is what users see when they scroll back up.)
    await styleHeaderRow(spreadsheetId, TAB_NAME, guestHeader.length, accessToken);
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not write to the spreadsheet. Confirm you have edit access.',
    };
  }

  // Save the spreadsheet id on the event so future pushes pre-fill the URL.
  await supabase
    .from('events')
    .update({
      google_sheet_id: spreadsheetId,
      google_sheet_last_pushed_at: new Date().toISOString(),
    })
    .eq('event_id', event_id);

  revalidatePath(`/events/${event_id}`);

  return {
    ok: true,
    spreadsheet_id: spreadsheetId,
    sheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    rows_written: 1 + guestRows.length, // +1 for the data-table header row
  };
}
