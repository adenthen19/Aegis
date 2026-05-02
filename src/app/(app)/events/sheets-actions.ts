'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getValidAccessToken } from '@/lib/google/oauth';
import {
  applyCheckboxValidation,
  ensureTab,
  parseSpreadsheetId,
  readRange,
  styleHeaderRow,
  writeRangeReplacing,
} from '@/lib/google/sheets';
import type { EventGuest } from '@/lib/types';

export type SyncSheetResult =
  | {
      ok: true;
      spreadsheet_id: string;
      sheet_url: string;
      pulled_count: number;     // # of guest rows whose status the sheet flipped
      pushed_rows: number;      // # of data-table rows we wrote back
    }
  | { ok: false; error: string };

const TAB_NAME = 'Aegis Attendance';
const SUMMARY_ROW_COUNT = 11; // see buildSheetRows() — must stay in sync

// ─────────────────────────────────────────────────────────────────────────
// Sheet ↔ Aegis matching
// ─────────────────────────────────────────────────────────────────────────
// We need a stable key per guest to map sheet rows to DB rows. Email is
// preferred (case-insensitive); fallback is `full_name|company` lowercased.
// This matches the dedup logic in event-import so the round-trip is
// consistent.

function matchKey(args: {
  full_name: string;
  email: string | null;
  company: string | null;
}): string {
  const email = args.email?.trim().toLowerCase();
  if (email) return `e:${email}`;
  return `nc:${args.full_name.trim().toLowerCase()}|${(args.company ?? '').trim().toLowerCase()}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Build the sheet payload from current Aegis state. Returns the rows + the
// guest-table header so the caller can style it after writing.
// ─────────────────────────────────────────────────────────────────────────

type EventForSheet = {
  name: string;
  event_date: string;
  location: string | null;
  clientLabel: string;
};

const GUEST_HEADER = [
  'Name',
  'Title',
  'Company',
  'Email',
  'Contact number',
  'Table',
  'Checked in',
  'Checked in at',
] as const;

// Column index of "Checked in" in the guest table (0-indexed) — used by
// the pull side to find the right cell when comparing.
const STATUS_COL = 6;

function sortGuests(guests: EventGuest[]): EventGuest[] {
  return [...guests].sort((a, b) => {
    if (a.checked_in !== b.checked_in) return a.checked_in ? -1 : 1;
    if (a.checked_in && b.checked_in) {
      return (a.checked_in_at ?? '').localeCompare(b.checked_in_at ?? '');
    }
    return a.full_name.localeCompare(b.full_name);
  });
}

function buildSheetRows(
  event: EventForSheet,
  guests: EventGuest[],
): (string | number | boolean | null)[][] {
  const sorted = sortGuests(guests);
  const total = sorted.length;
  const checkedIn = sorted.filter((g) => g.checked_in).length;
  const pct = total === 0 ? 0 : Math.round((checkedIn / total) * 100);

  // Keep this 11 rows long (matches SUMMARY_ROW_COUNT). If you add/remove
  // rows here, update the constant or the pull side will look at the wrong
  // row index for the data-table header.
  const summary: (string | number)[][] = [
    ['Aegis Attendance Report'],
    ['Event', event.name],
    ['Client', event.clientLabel],
    ['Date', new Date(event.event_date).toLocaleString('en-GB')],
    ['Location', event.location ?? ''],
    ['Total guests', total],
    ['Checked in', checkedIn],
    ['Attendance %', `${pct}%`],
    ['Last synced', new Date().toLocaleString('en-GB')],
    ['', ''],
    ['', ''],
  ];

  // Status cell is a boolean — combined with the BOOLEAN data validation
  // applied after writing, this renders as a tap-to-toggle checkbox in the
  // sheet. Ushers tick → TRUE → next sync flips Aegis to checked-in.
  const data: (string | number | boolean | null)[][] = sorted.map((g) => [
    g.full_name,
    g.title ?? '',
    g.company ?? '',
    g.email ?? '',
    g.contact_number ?? '',
    g.table_number ?? '',
    g.checked_in,
    g.checked_in_at ? new Date(g.checked_in_at).toLocaleString('en-GB') : '',
  ]);

  return [...summary, [...GUEST_HEADER], ...data];
}

// ─────────────────────────────────────────────────────────────────────────
// Push: write Aegis state → Sheet (clear + write + style)
// ─────────────────────────────────────────────────────────────────────────

async function pushAegisToSheet(
  spreadsheetId: string,
  accessToken: string,
  event: EventForSheet,
  guests: EventGuest[],
): Promise<{ rowsWritten: number }> {
  await ensureTab(spreadsheetId, TAB_NAME, accessToken);
  const rows = buildSheetRows(event, guests);
  await writeRangeReplacing(
    spreadsheetId,
    `${TAB_NAME}!A1`,
    rows,
    accessToken,
  );
  await styleHeaderRow(spreadsheetId, TAB_NAME, GUEST_HEADER.length, accessToken);

  // Apply BOOLEAN validation to the Status column for the data rows so the
  // cells render as tap-to-toggle checkboxes. The data rows live below the
  // summary block + header row; row indexes here are 0-based for the API.
  const guestCount = guests.length;
  if (guestCount > 0) {
    const headerRowIndex = SUMMARY_ROW_COUNT; // 0-based — header row sits at this index
    const dataStart = headerRowIndex + 1;
    await applyCheckboxValidation(
      spreadsheetId,
      TAB_NAME,
      STATUS_COL,
      dataStart,
      dataStart + guestCount,
      accessToken,
    );
  }

  return { rowsWritten: rows.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Pull: read Sheet → diff vs Aegis → apply changes back to Aegis
//
// We trust the sheet on conflict — if a usher manually changed the Status
// cell, that's a deliberate action and should win. Aegis kiosk check-ins
// sit alongside in the audit log, so an admin can always reconstruct.
// Rows in the sheet that don't match a known guest (e.g. someone added a
// new row) are ignored — Aegis remains the source of truth for who's
// invited; the sheet can only flip status on existing guests.
// ─────────────────────────────────────────────────────────────────────────

async function pullSheetToAegis(args: {
  supabase: SupabaseClient;
  spreadsheetId: string;
  accessToken: string;
  event_id: string;
  performed_by_user_id: string;
  guests: EventGuest[];
}): Promise<{ pulledCount: number }> {
  const { supabase, spreadsheetId, accessToken, event_id, performed_by_user_id, guests } = args;

  let sheetRows: string[][];
  try {
    sheetRows = await readRange(spreadsheetId, TAB_NAME, accessToken);
  } catch (err) {
    // If the tab doesn't exist yet (first push not yet done), there's
    // nothing to pull — return cleanly so the caller can still push.
    const msg = err instanceof Error ? err.message : '';
    if (/Unable to parse range|not found|does not exist/i.test(msg)) {
      return { pulledCount: 0 };
    }
    throw err;
  }

  if (sheetRows.length <= SUMMARY_ROW_COUNT) return { pulledCount: 0 };

  // The data-table header sits at row index SUMMARY_ROW_COUNT (0-indexed),
  // so the actual guest data starts one row below.
  const dataStart = SUMMARY_ROW_COUNT + 1;
  const dataRows = sheetRows.slice(dataStart);

  // Build a map of sheet check-in state by guest match-key. We accept
  // multiple representations so the sheet stays forgiving:
  //   • Checkbox cells (current default): "TRUE" / "FALSE" via FORMATTED_VALUE
  //   • Legacy text we used to write: "Checked in" / "Pending"
  //   • Anything else: ignored — the row is treated as "no opinion" so a
  //     half-edited cell can't accidentally un-check someone.
  const sheetStatusByKey = new Map<string, boolean>();
  for (const row of dataRows) {
    const full_name = (row[0] ?? '').trim();
    if (!full_name) continue;
    const company = (row[2] ?? '').trim() || null;
    const email = (row[3] ?? '').trim() || null;
    const raw = (row[STATUS_COL] ?? '').trim();
    let checkedIn: boolean | null = null;
    if (raw === 'TRUE' || raw === 'true' || raw === 'Checked in') {
      checkedIn = true;
    } else if (raw === 'FALSE' || raw === 'false' || raw === 'Pending') {
      checkedIn = false;
    }
    if (checkedIn === null) continue;
    sheetStatusByKey.set(matchKey({ full_name, email, company }), checkedIn);
  }

  // Diff vs Aegis. Collect guest_ids that need to flip.
  const toCheckIn: string[] = [];
  const toUndo: string[] = [];
  for (const g of guests) {
    const sheetCheckedIn = sheetStatusByKey.get(
      matchKey({ full_name: g.full_name, email: g.email, company: g.company }),
    );
    if (sheetCheckedIn === undefined) continue;
    if (sheetCheckedIn === g.checked_in) continue;
    if (sheetCheckedIn) toCheckIn.push(g.guest_id);
    else toUndo.push(g.guest_id);
  }

  if (toCheckIn.length === 0 && toUndo.length === 0) {
    return { pulledCount: 0 };
  }

  // Apply the flips. Each side is one bulk UPDATE + N audit rows.
  if (toCheckIn.length > 0) {
    await supabase
      .from('event_guests')
      .update({ checked_in: true })
      .in('guest_id', toCheckIn);
    await supabase.from('event_guest_checkins').insert(
      toCheckIn.map((guest_id) => ({
        guest_id,
        event_id,
        action: 'checkin' as const,
        source: 'sheet' as const,
        performed_by_user_id,
        notes: 'Synced from Google Sheet',
      })),
    );
  }
  if (toUndo.length > 0) {
    await supabase
      .from('event_guests')
      .update({ checked_in: false })
      .in('guest_id', toUndo);
    await supabase.from('event_guest_checkins').insert(
      toUndo.map((guest_id) => ({
        guest_id,
        event_id,
        action: 'undo' as const,
        source: 'sheet' as const,
        performed_by_user_id,
        notes: 'Synced from Google Sheet',
      })),
    );
  }

  return { pulledCount: toCheckIn.length + toUndo.length };
}

// ─────────────────────────────────────────────────────────────────────────
// Two-way sync: pull first (so newly-flipped guests show up in the push),
// then push the resulting state. Single round-trip per direction.
// ─────────────────────────────────────────────────────────────────────────

async function loadEventForSync(
  supabase: SupabaseClient,
  event_id: string,
): Promise<{
  event: EventForSheet;
  guests: EventGuest[];
} | null> {
  const { data: eventRaw } = await supabase
    .from('events')
    .select(
      'event_id, name, event_date, location, adhoc_client_name, clients ( corporate_name )',
    )
    .eq('event_id', event_id)
    .maybeSingle();
  if (!eventRaw) return null;

  const eventRow = eventRaw as unknown as {
    name: string;
    event_date: string;
    location: string | null;
    adhoc_client_name: string | null;
    clients: { corporate_name: string } | null;
  };

  const { data: guestsRaw } = await supabase
    .from('event_guests')
    .select('*')
    .eq('event_id', event_id);

  return {
    event: {
      name: eventRow.name,
      event_date: eventRow.event_date,
      location: eventRow.location,
      clientLabel:
        eventRow.clients?.corporate_name ?? eventRow.adhoc_client_name ?? '',
    },
    guests: (guestsRaw ?? []) as EventGuest[],
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Public actions
// ─────────────────────────────────────────────────────────────────────────

// First-time bind: user pastes a sheet URL in the modal. Validates access,
// runs an initial push, saves the sheet id + owner on the event so future
// syncs can run without prompting.
export async function bindEventToSheetAction(
  event_id: string,
  sheet_input: string,
): Promise<SyncSheetResult> {
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

  const loaded = await loadEventForSync(supabase, event_id);
  if (!loaded) return { ok: false, error: 'Event not found.' };

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

  let pushed: { rowsWritten: number };
  try {
    pushed = await pushAegisToSheet(
      spreadsheetId,
      accessToken,
      loaded.event,
      loaded.guests,
    );
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not write to the spreadsheet. Confirm you have edit access.',
    };
  }

  await supabase
    .from('events')
    .update({
      google_sheet_id: spreadsheetId,
      google_sheet_owner_user_id: user.id,
      google_sheet_last_pushed_at: new Date().toISOString(),
    })
    .eq('event_id', event_id);

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);

  return {
    ok: true,
    spreadsheet_id: spreadsheetId,
    sheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    pulled_count: 0,
    pushed_rows: pushed.rowsWritten,
  };
}

// Two-way sync: the heart of the integration. Pulls any sheet edits into
// Aegis, then pushes the resulting state back. Caller's Google connection
// is used. Quietly no-ops if no sheet is bound on the event.
export async function syncEventSheetAction(
  event_id: string,
): Promise<SyncSheetResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const { data: eventMeta } = await supabase
    .from('events')
    .select('google_sheet_id')
    .eq('event_id', event_id)
    .maybeSingle();
  const spreadsheetId = (eventMeta as { google_sheet_id: string | null } | null)
    ?.google_sheet_id;
  if (!spreadsheetId) {
    return {
      ok: false,
      error: 'No Google Sheet is bound to this event. Click "Bind sheet" first.',
    };
  }

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
          : 'Google account not connected.',
    };
  }

  const loaded = await loadEventForSync(supabase, event_id);
  if (!loaded) return { ok: false, error: 'Event not found.' };

  // ── Step 1: pull sheet → Aegis ────────────────────────────────────
  let pulledCount = 0;
  try {
    const r = await pullSheetToAegis({
      supabase,
      spreadsheetId,
      accessToken,
      event_id,
      performed_by_user_id: user.id,
      guests: loaded.guests,
    });
    pulledCount = r.pulledCount;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Sheet read failed.',
    };
  }

  // If we pulled changes, reload guests so the push reflects them.
  let guestsForPush = loaded.guests;
  if (pulledCount > 0) {
    const refreshed = await loadEventForSync(supabase, event_id);
    if (refreshed) guestsForPush = refreshed.guests;
  }

  // ── Step 2: push Aegis → sheet ────────────────────────────────────
  let pushed: { rowsWritten: number };
  try {
    pushed = await pushAegisToSheet(
      spreadsheetId,
      accessToken,
      loaded.event,
      guestsForPush,
    );
  } catch (err) {
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : 'Could not write to the spreadsheet.',
    };
  }

  await supabase
    .from('events')
    .update({ google_sheet_last_pushed_at: new Date().toISOString() })
    .eq('event_id', event_id);

  if (pulledCount > 0) {
    revalidatePath(`/events/${event_id}`);
    revalidatePath(`/kiosk/${event_id}`);
  }

  return {
    ok: true,
    spreadsheet_id: spreadsheetId,
    sheet_url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    pulled_count: pulledCount,
    pushed_rows: pushed.rowsWritten,
  };
}

// Drop the binding without disconnecting the user's Google account itself.
export async function unbindEventFromSheetAction(
  event_id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const { error } = await supabase
    .from('events')
    .update({
      google_sheet_id: null,
      google_sheet_owner_user_id: null,
      google_sheet_last_pushed_at: null,
    })
    .eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);
  return { ok: true, error: null };
}
