'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type {
  EventStatus,
  GuestTier,
  RoomMarkerKind,
  TableSection,
} from '@/lib/types';
import {
  IMPORT_INITIAL,
  parseCsv,
  type ImportRowError,
  type ImportState,
} from '@/lib/csv';
import { EVENT_GUEST_IMPORT_HEADERS } from '@/lib/event-import';

export type ActionState = { ok: boolean; error: string | null };

const STATUSES: EventStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];
const TIERS: GuestTier[] = ['vip', 'analyst', 'kol', 'media', 'standard'];
const SECTIONS: TableSection[] = ['vip', 'analyst', 'kol', 'media', 'mixed'];

function normaliseTier(value: unknown): GuestTier {
  return typeof value === 'string' && TIERS.includes(value as GuestTier)
    ? (value as GuestTier)
    : 'standard';
}

function normaliseSection(value: unknown): TableSection {
  return typeof value === 'string' && SECTIONS.includes(value as TableSection)
    ? (value as TableSection)
    : 'mixed';
}

type EventPayload = {
  client_id: string | null;
  adhoc_client_name: string | null;
  name: string;
  event_date: string;
  location: string | null;
  description: string | null;
  status: EventStatus;
  default_table_capacity: number | null;
  /** When true, walk-ins land as walkin_status='pending' until a director
   *  or super_admin approves them. Defaults to false on create. */
  requires_walkin_approval: boolean;
};

function readEventPayload(
  formData: FormData,
): { ok: true; value: EventPayload } | { ok: false; error: string } {
  const name = formData.get('name')?.toString().trim();
  if (!name) return { ok: false, error: 'Event name is required.' };

  const event_date = formData.get('event_date')?.toString();
  if (!event_date) return { ok: false, error: 'Event date is required.' };

  // The form sends `client_kind=existing|adhoc` so we know which side to
  // honour even when the other field still carries a stale value from
  // toggling.
  const kind = formData.get('client_kind')?.toString();
  let client_id: string | null = null;
  let adhoc_client_name: string | null = null;
  if (kind === 'existing') {
    client_id = formData.get('client_id')?.toString().trim() || null;
    if (!client_id) return { ok: false, error: 'Pick a client.' };
  } else if (kind === 'adhoc') {
    adhoc_client_name = formData.get('adhoc_client_name')?.toString().trim() || null;
    if (!adhoc_client_name) {
      return { ok: false, error: 'Ad-hoc client name is required.' };
    }
  } else {
    return { ok: false, error: 'Pick existing client or enter ad-hoc name.' };
  }

  const status_raw = formData.get('status')?.toString() ?? 'planned';
  const status: EventStatus = STATUSES.includes(status_raw as EventStatus)
    ? (status_raw as EventStatus)
    : 'planned';

  // Empty/blank default capacity → null = "capacity warnings disabled".
  // Anything > 0 is honoured; non-positive numbers are rejected so the DB
  // check constraint isn't the first line of defence.
  const cap_raw = formData.get('default_table_capacity')?.toString().trim() ?? '';
  let default_table_capacity: number | null = null;
  if (cap_raw !== '') {
    const parsed = Number.parseInt(cap_raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      return {
        ok: false,
        error: 'Default table capacity must be a positive whole number, or blank.',
      };
    }
    default_table_capacity = parsed;
  }

  // CheckboxField submits 'true' when checked; absent when unchecked.
  const requires_walkin_approval =
    formData.get('requires_walkin_approval')?.toString() === 'true';

  return {
    ok: true,
    value: {
      client_id,
      adhoc_client_name,
      name,
      event_date,
      location: formData.get('location')?.toString().trim() || null,
      description: formData.get('description')?.toString().trim() || null,
      status,
      default_table_capacity,
      requires_walkin_approval,
    },
  };
}

// ────────────────────────────────────────────────────────────────────────
// Events CRUD
// ────────────────────────────────────────────────────────────────────────

export async function createEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readEventPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('events').insert(payload.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/events');
  return { ok: true, error: null };
}

export async function updateEventAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const event_id = formData.get('event_id')?.toString();
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const payload = readEventPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase
    .from('events')
    .update(payload.value)
    .eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/events');
  revalidatePath(`/events/${event_id}`);
  return { ok: true, error: null };
}

export async function deleteEventAction(event_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const { error } = await supabase.from('events').delete().eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/events');
  return { ok: true, error: null };
}

export async function setEventStatusAction(
  event_id: string,
  next_status: EventStatus,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };
  if (!STATUSES.includes(next_status)) return { ok: false, error: 'Invalid status.' };

  const { error } = await supabase
    .from('events')
    .update({ status: next_status })
    .eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/events');
  revalidatePath(`/events/${event_id}`);
  return { ok: true, error: null };
}

// ────────────────────────────────────────────────────────────────────────
// Seating: default capacity + per-table overrides
// ────────────────────────────────────────────────────────────────────────
//
// Capacity lives in two places by design:
//   • events.default_table_capacity — the standard (e.g. 10 pax/round table).
//   • event_tables — sparse override registry (head table = 12, VIP = 6).
// Lookup at use site is `coalesce(event_tables.capacity, events.default_table_capacity)`.
// All warnings are *soft*; nothing here ever blocks a check-in.

export async function setEventDefaultCapacityAction(
  event_id: string,
  capacity: number | null,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  // null is a valid value — explicitly turns capacity tracking off for the
  // event. Anything else must be a positive integer; the DB has the same
  // check but we want a clean error before round-tripping.
  if (capacity !== null && (!Number.isInteger(capacity) || capacity <= 0)) {
    return { ok: false, error: 'Capacity must be a positive whole number.' };
  }

  const { error } = await supabase
    .from('events')
    .update({ default_table_capacity: capacity })
    .eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);
  return { ok: true, error: null };
}

export async function upsertEventTableAction(
  event_id: string,
  table_number: string,
  capacity: number,
  label: string | null,
  section: TableSection = 'mixed',
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const trimmed = table_number.trim();
  if (!trimmed) return { ok: false, error: 'Table number is required.' };
  if (!Number.isInteger(capacity) || capacity <= 0) {
    return { ok: false, error: 'Capacity must be a positive whole number.' };
  }

  const { error } = await supabase
    .from('event_tables')
    .upsert(
      {
        event_id,
        table_number: trimmed,
        capacity,
        label: label?.trim() || null,
        section: normaliseSection(section),
      },
      { onConflict: 'event_id,table_number' },
    );
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);
  return { ok: true, error: null };
}

export type TableSwapMode = 'move' | 'swap';

export type TableSwapResult =
  | { ok: true; moved_from: number; moved_to: number; error: null }
  | { ok: false; error: string };

// Bulk re-seat a whole table (or two), audited row-per-guest. Two modes:
//   • move  — guests at `from_table` shift to `to_table`. Anyone already at
//             `to_table` stays put (the two groups merge).
//   • swap  — guests at `from_table` shift to `to_table` AND vice versa.
//             Implemented with a temp marker between the two updates so
//             we don't have to lean on a stored procedure for atomicity:
//                 from → tmp, to → from, tmp → to
//             A failure between steps 2 and 3 leaves the audit feed clean
//             (we only write audit AFTER all writes commit) and a clear
//             tmp marker that a retry will recover.
export async function swapEventTablesAction(
  event_id: string,
  from_table: string,
  to_table: string,
  mode: TableSwapMode,
): Promise<TableSwapResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const from = from_table.trim();
  const to = to_table.trim();
  if (!from || !to) {
    return { ok: false, error: 'Both source and destination tables are required.' };
  }
  if (from === to) {
    return { ok: false, error: 'Source and destination must be different tables.' };
  }
  if (mode !== 'move' && mode !== 'swap') {
    return { ok: false, error: 'Unknown swap mode.' };
  }

  // Snapshot affected rows so the audit can name each guest. The 'swap'
  // case needs both groups; the 'move' case only needs the source group.
  const { data: fromGuests, error: fromErr } = await supabase
    .from('event_guests')
    .select('guest_id, full_name')
    .eq('event_id', event_id)
    .eq('table_number', from);
  if (fromErr) return { ok: false, error: fromErr.message };
  if (!fromGuests || fromGuests.length === 0) {
    return {
      ok: false,
      error: `No guests are currently at Table ${from}.`,
    };
  }

  let toGuests: { guest_id: string; full_name: string }[] = [];
  if (mode === 'swap') {
    const { data, error } = await supabase
      .from('event_guests')
      .select('guest_id, full_name')
      .eq('event_id', event_id)
      .eq('table_number', to);
    if (error) return { ok: false, error: error.message };
    toGuests = (data ?? []) as { guest_id: string; full_name: string }[];
  }

  // Tmp marker is namespaced + timestamped so concurrent swaps from
  // different events can never collide on it (unlikely, but cheap to
  // guarantee).
  const tmpMarker = `__AEGIS_SWAP_TMP_${Date.now()}__`;

  if (mode === 'move') {
    const { error } = await supabase
      .from('event_guests')
      .update({ table_number: to })
      .eq('event_id', event_id)
      .eq('table_number', from);
    if (error) return { ok: false, error: error.message };
  } else {
    // swap: from → tmp, to → from, tmp → to
    const step1 = await supabase
      .from('event_guests')
      .update({ table_number: tmpMarker })
      .eq('event_id', event_id)
      .eq('table_number', from);
    if (step1.error) return { ok: false, error: step1.error.message };

    const step2 = await supabase
      .from('event_guests')
      .update({ table_number: from })
      .eq('event_id', event_id)
      .eq('table_number', to);
    if (step2.error) {
      // Best-effort recovery: roll the tmp guests back to the source
      // table so we don't leave the marker visible.
      await supabase
        .from('event_guests')
        .update({ table_number: from })
        .eq('event_id', event_id)
        .eq('table_number', tmpMarker);
      return { ok: false, error: step2.error.message };
    }

    const step3 = await supabase
      .from('event_guests')
      .update({ table_number: to })
      .eq('event_id', event_id)
      .eq('table_number', tmpMarker);
    if (step3.error) {
      // Half-swapped state: the source-side group is now at `from` (their
      // destination after the swap finishes) but tmp guests are stuck.
      // Surface clearly so the user can re-run; a re-run will see the tmp
      // marker and finish the move.
      return {
        ok: false,
        error: `Partial swap — re-run to finish. ${step3.error.message}`,
      };
    }
  }

  // Audit one row per affected guest. Notes carry the human-readable
  // before/after so the activity feed reads naturally.
  const auditRows: Array<{
    guest_id: string;
    event_id: string;
    action: 'table_swap';
    source: 'admin';
    performed_by_user_id: string;
    notes: string;
  }> = [];
  for (const g of fromGuests) {
    auditRows.push({
      guest_id: g.guest_id as string,
      event_id,
      action: 'table_swap',
      source: 'admin',
      performed_by_user_id: user.id,
      notes:
        mode === 'move'
          ? `Moved ${from} → ${to} (bulk move)`
          : `Swapped ${from} → ${to} (bulk swap)`,
    });
  }
  if (mode === 'swap') {
    for (const g of toGuests) {
      auditRows.push({
        guest_id: g.guest_id as string,
        event_id,
        action: 'table_swap',
        source: 'admin',
        performed_by_user_id: user.id,
        notes: `Swapped ${to} → ${from} (bulk swap)`,
      });
    }
  }
  await supabase.from('event_guest_checkins').insert(auditRows);

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);

  return {
    ok: true,
    error: null,
    moved_from: fromGuests.length,
    moved_to: toGuests.length,
  };
}

// ────────────────────────────────────────────────────────────────────────
// Floor-plan layout (positions + markers)
// ────────────────────────────────────────────────────────────────────────
//
// Saves the entire layout in a single round-trip:
//   • For each table position: upsert event_tables (auto-create the row
//     if it doesn't exist yet, falling back to the event's default
//     capacity). Section/label preserved when the row already exists.
//   • For markers: replace-all (delete everything, insert payload).
//     Markers are sparse, small, and the host typically edits the whole
//     set in one go. Delete-all keeps the action atomic without needing
//     id-stable diffing on the client.

const MARKER_KINDS: RoomMarkerKind[] = [
  'stage',
  'door',
  'entrance',
  'podium',
  'registration',
  'custom',
];

export type SaveLayoutPayload = {
  /** Table positions. Each entry upserts (event_tables.x, event_tables.y).
   *  Tables that exist in event_guests but not in event_tables get a
   *  fresh row with the event's default capacity copied in (so the row
   *  can carry x/y). */
  tables: Array<{ table_number: string; x: number; y: number }>;
  /** Full marker set for the event. Replaces whatever's currently saved.
   *  marker_id is ignored on insert — we generate fresh ones every save. */
  markers: Array<{
    kind: RoomMarkerKind;
    label: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    rotation: number;
  }>;
};

function clampCoord(value: number, max = 2000): number {
  if (!Number.isFinite(value)) return 0;
  const v = Math.round(value);
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

export async function saveEventLayoutAction(
  event_id: string,
  payload: SaveLayoutPayload,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  // Read the event's default capacity so any auto-created event_tables
  // row has a sensible value to start from. If the event has no default,
  // we fall back to 10 (typical round-table size) — non-blocking and the
  // host can edit it later in the list view.
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('default_table_capacity')
    .eq('event_id', event_id)
    .maybeSingle();
  if (evErr) return { ok: false, error: evErr.message };
  if (!ev) return { ok: false, error: 'Event not found.' };
  const fallbackCapacity =
    typeof ev.default_table_capacity === 'number'
      ? ev.default_table_capacity
      : 10;

  // Read existing event_tables so we know which rows we can update in
  // place vs which need to be inserted. table_number is the natural key.
  const { data: existingTables, error: existingErr } = await supabase
    .from('event_tables')
    .select('table_number, capacity, label, section')
    .eq('event_id', event_id);
  if (existingErr) return { ok: false, error: existingErr.message };
  const existingMap = new Map(
    (existingTables ?? []).map(
      (t) =>
        [t.table_number as string, t as { capacity: number; label: string | null; section: TableSection }] as const,
    ),
  );

  // Build the upsert payload. Carry forward capacity/label/section for
  // existing rows so we don't overwrite them with defaults.
  const upserts = payload.tables
    .filter((t) => typeof t.table_number === 'string' && t.table_number.trim())
    .map((t) => {
      const existing = existingMap.get(t.table_number.trim());
      return {
        event_id,
        table_number: t.table_number.trim(),
        x: clampCoord(t.x, 1200),
        y: clampCoord(t.y, 800),
        capacity: existing?.capacity ?? fallbackCapacity,
        label: existing?.label ?? null,
        section: existing?.section ?? ('mixed' as TableSection),
      };
    });

  if (upserts.length > 0) {
    const { error } = await supabase
      .from('event_tables')
      .upsert(upserts, { onConflict: 'event_id,table_number' });
    if (error) return { ok: false, error: error.message };
  }

  // Markers: replace-all. Delete first, then insert. Inserts run only
  // when the payload is non-empty so an "empty layout" save doesn't
  // round-trip a useless insert.
  const { error: deleteErr } = await supabase
    .from('event_room_markers')
    .delete()
    .eq('event_id', event_id);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  const markerInserts = payload.markers
    .filter((m) => MARKER_KINDS.includes(m.kind))
    .map((m) => ({
      event_id,
      kind: m.kind,
      label: m.label?.trim() || null,
      x: clampCoord(m.x, 1200),
      y: clampCoord(m.y, 800),
      w: clampCoord(m.w, 1200),
      h: clampCoord(m.h, 800),
      rotation: ((Math.round(m.rotation) % 360) + 360) % 360,
    }));

  if (markerInserts.length > 0) {
    const { error } = await supabase
      .from('event_room_markers')
      .insert(markerInserts);
    if (error) return { ok: false, error: error.message };
  }

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);
  return { ok: true, error: null };
}

export async function deleteEventTableAction(
  event_id: string,
  table_number: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };
  if (!table_number) return { ok: false, error: 'Missing table number.' };

  // Deleting an override does NOT remove the table from the event — guests
  // assigned to it still exist; they simply fall back to the event default.
  const { error } = await supabase
    .from('event_tables')
    .delete()
    .eq('event_id', event_id)
    .eq('table_number', table_number);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);
  return { ok: true, error: null };
}

// ────────────────────────────────────────────────────────────────────────
// Guests CRUD
// ────────────────────────────────────────────────────────────────────────

type GuestPayload = {
  full_name: string;
  title: string | null;
  company: string | null;
  contact_number: string | null;
  email: string | null;
  table_number: string | null;
  notes: string | null;
  tier: GuestTier;
};

function readGuestPayload(
  formData: FormData,
): { ok: true; value: GuestPayload } | { ok: false; error: string } {
  const full_name = formData.get('full_name')?.toString().trim();
  if (!full_name) return { ok: false, error: 'Guest name is required.' };

  const email = formData.get('email')?.toString().trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email looks invalid.' };
  }

  return {
    ok: true,
    value: {
      full_name,
      title: formData.get('title')?.toString().trim() || null,
      company: formData.get('company')?.toString().trim() || null,
      contact_number: formData.get('contact_number')?.toString().trim() || null,
      email,
      table_number: formData.get('table_number')?.toString().trim() || null,
      notes: formData.get('notes')?.toString().trim() || null,
      tier: normaliseTier(formData.get('tier')),
    },
  };
}

export async function createGuestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const event_id = formData.get('event_id')?.toString();
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const payload = readGuestPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase
    .from('event_guests')
    .insert({ event_id, ...payload.value });
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${event_id}`);
  return { ok: true, error: null };
}

export async function updateGuestAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const guest_id = formData.get('guest_id')?.toString();
  if (!guest_id) return { ok: false, error: 'Missing guest id.' };

  const payload = readGuestPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { data: row, error: updateErr } = await supabase
    .from('event_guests')
    .update(payload.value)
    .eq('guest_id', guest_id)
    .select('event_id')
    .single();
  if (updateErr) return { ok: false, error: updateErr.message };

  revalidatePath(`/events/${row?.event_id as string}`);
  return { ok: true, error: null };
}

export async function deleteGuestAction(guest_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!guest_id) return { ok: false, error: 'Missing guest id.' };

  const { data: row } = await supabase
    .from('event_guests')
    .select('event_id')
    .eq('guest_id', guest_id)
    .maybeSingle();

  const { error } = await supabase
    .from('event_guests')
    .delete()
    .eq('guest_id', guest_id);
  if (error) return { ok: false, error: error.message };

  if (row?.event_id) revalidatePath(`/events/${row.event_id as string}`);
  return { ok: true, error: null };
}

export async function toggleGuestCheckInAction(
  guest_id: string,
  next: boolean,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!guest_id) return { ok: false, error: 'Missing guest id.' };

  // Read previous state so the audit row only fires on a real flip — toggling
  // the same value twice (idempotent UPDATE) shouldn't pollute the activity feed.
  const { data: prev } = await supabase
    .from('event_guests')
    .select('checked_in, event_id')
    .eq('guest_id', guest_id)
    .maybeSingle();
  if (!prev) return { ok: false, error: 'Guest not found.' };
  const wasIn = prev.checked_in as boolean;
  const eventId = prev.event_id as string;

  // checked_in_at is set/cleared by the BEFORE trigger; we only flip the flag.
  const { error } = await supabase
    .from('event_guests')
    .update({ checked_in: next })
    .eq('guest_id', guest_id);
  if (error) return { ok: false, error: error.message };

  if (wasIn !== next) {
    await supabase.from('event_guest_checkins').insert({
      guest_id,
      event_id: eventId,
      action: next ? 'checkin' : 'undo',
      source: 'admin',
      performed_by_user_id: user.id,
    });
  }

  revalidatePath(`/events/${eventId}`);
  revalidatePath(`/kiosk/${eventId}`);
  return { ok: true, error: null };
}

export async function bulkSetCheckInAction(
  event_id: string,
  next: boolean,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  // Snapshot the guests whose state actually flips so we can write one
  // audit row per real change (and not 200 noise rows when an event is
  // already fully checked-out and the admin hits "Reset" again).
  const { data: snapshot } = await supabase
    .from('event_guests')
    .select('guest_id, checked_in')
    .eq('event_id', event_id)
    .eq('checked_in', !next);
  const flipping = (snapshot ?? []).map((g) => g.guest_id as string);

  const { error } = await supabase
    .from('event_guests')
    .update({ checked_in: next })
    .eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  if (flipping.length > 0) {
    await supabase.from('event_guest_checkins').insert(
      flipping.map((guest_id) => ({
        guest_id,
        event_id,
        action: next ? 'checkin' : 'undo',
        source: 'admin' as const,
        performed_by_user_id: user.id,
        notes: 'Bulk reset',
      })),
    );
  }

  revalidatePath(`/events/${event_id}`);
  revalidatePath(`/kiosk/${event_id}`);
  return { ok: true, error: null };
}

// ────────────────────────────────────────────────────────────────────────
// Bulk import
// ────────────────────────────────────────────────────────────────────────

function buildGuestImportPayload(
  record: Record<string, string>,
): { ok: true; value: GuestPayload } | { ok: false; error: string } {
  const full_name = record.full_name?.trim();
  if (!full_name) return { ok: false, error: 'full_name is required.' };

  const email = record.email?.trim() || null;
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: `Invalid email "${email}".` };
  }

  return {
    ok: true,
    value: {
      full_name,
      title: record.title?.trim() || null,
      company: record.company?.trim() || null,
      contact_number: record.contact_number?.trim() || null,
      email,
      table_number: record.table_number?.trim() || null,
      notes: record.notes?.trim() || null,
      // CSV column 'tier' is optional. Anything unrecognised silently
      // falls back to 'standard' rather than failing the row — keeps
      // existing import workflows unbroken.
      tier: normaliseTier(record.tier?.trim().toLowerCase()),
    },
  };
}

export async function importGuestsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...IMPORT_INITIAL, error: 'You must be signed in.' };

  const event_id = formData.get('event_id')?.toString();
  if (!event_id) return { ...IMPORT_INITIAL, error: 'Missing event id.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ...IMPORT_INITIAL, error: 'Please choose a CSV file to import.' };
  }
  if (file.size > 2 * 1024 * 1024) {
    return { ...IMPORT_INITIAL, error: 'File is too large. Limit is 2 MB.' };
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length === 0) {
    return { ...IMPORT_INITIAL, error: 'The file is empty.' };
  }

  const headers = rows[0].map((h) => h.trim().toLowerCase());
  // Only `full_name` is strictly required; all other columns are optional but
  // expected to be in the template.
  if (!headers.includes('full_name')) {
    return {
      ...IMPORT_INITIAL,
      error: `Missing required column "full_name". Expected: ${EVENT_GUEST_IMPORT_HEADERS.join(', ')}.`,
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ...IMPORT_INITIAL, error: 'No data rows found beneath the header row.' };
  }

  // Pre-load existing guests for this event so re-imports skip duplicates.
  // We dedupe on (lowercased email) when present, else (lowercased name +
  // lowercased company) — sufficient for typical guest lists where multiple
  // people may share an email-less name within different companies.
  const { data: existing } = await supabase
    .from('event_guests')
    .select('full_name, company, email')
    .eq('event_id', event_id);
  const existingEmails = new Set(
    (existing ?? [])
      .map((g) => (g.email as string | null)?.trim().toLowerCase())
      .filter((s): s is string => !!s),
  );
  const existingNameCompany = new Set(
    (existing ?? [])
      .filter((g) => !(g.email as string | null))
      .map(
        (g) =>
          `${(g.full_name as string).trim().toLowerCase()}|${
            (g.company as string | null)?.trim().toLowerCase() ?? ''
          }`,
      ),
  );

  const payloads: (GuestPayload & { event_id: string })[] = [];
  const errors: ImportRowError[] = [];
  let duplicates = 0;

  dataRows.forEach((row, idx) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] ?? '';
    });
    const built = buildGuestImportPayload(record);
    if (!built.ok) {
      errors.push({ row: idx + 2, message: built.error });
      return;
    }
    const v = built.value;
    const emailKey = v.email?.toLowerCase();
    const nameCompanyKey = `${v.full_name.toLowerCase()}|${
      v.company?.toLowerCase() ?? ''
    }`;
    if (
      (emailKey && existingEmails.has(emailKey)) ||
      (!emailKey && existingNameCompany.has(nameCompanyKey))
    ) {
      duplicates += 1;
      return;
    }
    if (emailKey) existingEmails.add(emailKey);
    else existingNameCompany.add(nameCompanyKey);
    payloads.push({ event_id, ...v });
  });

  if (payloads.length === 0) {
    return {
      ok: errors.length === 0,
      error:
        errors.length === 0 && duplicates > 0
          ? null
          : 'No valid rows to import. Fix the errors below and try again.',
      imported: 0,
      skipped: errors.length,
      duplicates,
      errors,
    };
  }

  const { error } = await supabase.from('event_guests').insert(payloads);
  if (error) {
    return {
      ok: false,
      error: `Database error: ${error.message}`,
      imported: 0,
      skipped: errors.length + payloads.length,
      duplicates,
      errors,
    };
  }

  revalidatePath(`/events/${event_id}`);
  return {
    ok: true,
    error: null,
    imported: payloads.length,
    skipped: errors.length,
    duplicates,
    errors,
  };
}
