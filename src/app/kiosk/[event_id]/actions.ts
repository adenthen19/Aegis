'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type KioskCheckInResult =
  | {
      ok: true;
      guest: {
        guest_id: string;
        full_name: string;
        company: string | null;
        title: string | null;
        table_number: string | null;
        checked_in_at: string | null;
      };
      already: boolean;
    }
  | { ok: false; error: string };

// Kiosk action: one-way check-in for ad-hoc usher use. Cannot un-check.
// Returns the guest snapshot so the kiosk can flash a confirmation toast
// without waiting for the page to refetch.
export async function kioskCheckInAction(
  event_id: string,
  guest_id: string,
): Promise<KioskCheckInResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id || !guest_id) {
    return { ok: false, error: 'Missing event or guest id.' };
  }

  // Look up first to detect the "already checked in" path — we still want
  // to flash a friendly message rather than silently no-op.
  const { data: existing, error: lookupErr } = await supabase
    .from('event_guests')
    .select('guest_id, event_id, full_name, company, title, table_number, checked_in, checked_in_at')
    .eq('guest_id', guest_id)
    .eq('event_id', event_id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: 'Guest not found.' };

  if (existing.checked_in) {
    return {
      ok: true,
      already: true,
      guest: {
        guest_id: existing.guest_id as string,
        full_name: existing.full_name as string,
        company: (existing.company as string | null) ?? null,
        title: (existing.title as string | null) ?? null,
        table_number: (existing.table_number as string | null) ?? null,
        checked_in_at: (existing.checked_in_at as string | null) ?? null,
      },
    };
  }

  const { data: updated, error } = await supabase
    .from('event_guests')
    .update({ checked_in: true })
    .eq('guest_id', guest_id)
    .select('guest_id, full_name, company, title, table_number, checked_in_at')
    .single();
  if (error) return { ok: false, error: error.message };

  // Audit row — append-only history of who/when/source. We don't fail the
  // check-in if the audit insert errors (the guest is already updated and
  // the kiosk experience comes first), but we'd want this in logs in prod.
  await supabase.from('event_guest_checkins').insert({
    guest_id,
    event_id,
    action: 'checkin',
    source: 'kiosk',
    performed_by_user_id: user.id,
  });

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);

  return {
    ok: true,
    already: false,
    guest: {
      guest_id: updated.guest_id as string,
      full_name: updated.full_name as string,
      company: (updated.company as string | null) ?? null,
      title: (updated.title as string | null) ?? null,
      table_number: (updated.table_number as string | null) ?? null,
      checked_in_at: (updated.checked_in_at as string | null) ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Walk-in registration: a guest with no prior record arrives at the door.
// Inserts a fresh event_guests row, marks them checked-in immediately,
// and writes audit rows so the post-event report distinguishes the
// walk-in from a normal pre-registered check-in.
// ─────────────────────────────────────────────────────────────────────

export type KioskWalkInPayload = {
  full_name: string;
  title: string | null;
  company: string | null;
  contact_number: string | null;
  email: string | null;
  table_number: string | null;
  notes: string | null;
  /** True iff the usher acknowledged seating past capacity. */
  capacity_override: boolean;
};

export type KioskWalkInResult =
  | {
      ok: true;
      guest: {
        guest_id: string;
        full_name: string;
        company: string | null;
        title: string | null;
        table_number: string | null;
        checked_in_at: string | null;
      };
    }
  | { ok: false; error: string };

export async function kioskAddWalkInAction(
  event_id: string,
  payload: KioskWalkInPayload,
): Promise<KioskWalkInResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };

  const full_name = payload.full_name.trim();
  if (!full_name) return { ok: false, error: 'Name is required for a walk-in.' };
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { ok: false, error: 'Email looks invalid.' };
  }

  // Notes carry "Walk-in" as a marker so post-event reports can filter and
  // route follow-up to PR/sales (these are often the most interesting
  // attendees). Free-text usher notes are appended after the marker.
  const userNote = payload.notes?.trim();
  const composedNotes = userNote ? `Walk-in · ${userNote}` : 'Walk-in';

  const { data: inserted, error: insertErr } = await supabase
    .from('event_guests')
    .insert({
      event_id,
      full_name,
      title: payload.title?.trim() || null,
      company: payload.company?.trim() || null,
      contact_number: payload.contact_number?.trim() || null,
      email: payload.email?.trim() || null,
      table_number: payload.table_number?.trim() || null,
      notes: composedNotes,
      checked_in: true,
    })
    .select('guest_id, full_name, company, title, table_number, checked_in_at')
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  // Three audit rows so the activity feed reads naturally:
  //   1. walkin_add — "Aden was added as a walk-in"
  //   2. checkin    — keeps the headline "checked in" count consistent
  //   3. capacity_override (optional) — flags the seat-past-capacity
  // We don't fail the walk-in if audit inserts error — the guest is in.
  const baseAudit = {
    guest_id: inserted.guest_id as string,
    event_id,
    source: 'kiosk' as const,
    performed_by_user_id: user.id,
  };
  const auditRows: Array<typeof baseAudit & { action: string; notes: string | null }> = [
    { ...baseAudit, action: 'walkin_add', notes: null },
    { ...baseAudit, action: 'checkin', notes: 'Walk-in initial check-in' },
  ];
  if (payload.capacity_override && payload.table_number) {
    auditRows.push({
      ...baseAudit,
      action: 'capacity_override',
      notes: `Seated past capacity at table ${payload.table_number.trim()}`,
    });
  }
  await supabase.from('event_guest_checkins').insert(auditRows);

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);

  return {
    ok: true,
    guest: {
      guest_id: inserted.guest_id as string,
      full_name: inserted.full_name as string,
      company: (inserted.company as string | null) ?? null,
      title: (inserted.title as string | null) ?? null,
      table_number: (inserted.table_number as string | null) ?? null,
      checked_in_at: (inserted.checked_in_at as string | null) ?? null,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────
// +1 companion: a registered guest brings someone who isn't on the list.
// We always create a NEW event_guests row for the companion (rather than
// bumping a "party_size" counter) because each warm body needs their own
// check-in, dietary tag, badge, and post-event follow-up.
//
// Three seating modes, each with different downstream effects:
//   • same       — companion takes the host's current table_number; host
//                  stays put. Used when the host's table has room.
//   • move_both  — the host AND companion both go to `new_table`. Two
//                  rows updated, one table_swap audit on the host.
//   • split      — companion goes to `new_table`, host stays put.
//   • override   — same effective seat as `same`, but explicitly flagged
//                  as past capacity. Always seats both onto host's table.
//
// `capacity_override` is audited whenever the seated table is at-or-over
// capacity at the time of the action, regardless of mode.
// ─────────────────────────────────────────────────────────────────────

export type KioskCompanionMode = 'same' | 'move_both' | 'split' | 'override';

export type KioskCompanionPayload = {
  full_name: string;
  title: string | null;
  company: string | null;
  contact_number: string | null;
  email: string | null;
  notes: string | null;
  mode: KioskCompanionMode;
  /** Required for `move_both` and `split`; ignored otherwise. */
  new_table: string | null;
  /** True iff the destination is at-or-over capacity. */
  capacity_override: boolean;
};

export type KioskCompanionResult =
  | {
      ok: true;
      guest: {
        guest_id: string;
        full_name: string;
        company: string | null;
        title: string | null;
        table_number: string | null;
        checked_in_at: string | null;
      };
      /** When mode is `move_both`, the host moved with them — surfaced so the
       *  caller can refresh their UI without round-tripping. */
      host_moved_to: string | null;
    }
  | { ok: false; error: string };

export async function kioskAddCompanionAction(
  event_id: string,
  host_guest_id: string,
  payload: KioskCompanionPayload,
): Promise<KioskCompanionResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id || !host_guest_id) {
    return { ok: false, error: 'Missing event or host guest id.' };
  }

  const full_name = payload.full_name.trim();
  if (!full_name) {
    return { ok: false, error: 'Companion name is required (placeholder ok — edit later).' };
  }
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { ok: false, error: 'Email looks invalid.' };
  }

  // Look up the host so we can copy company by default and know their
  // current table for the `same` / `override` paths.
  const { data: host, error: hostErr } = await supabase
    .from('event_guests')
    .select('guest_id, full_name, company, table_number')
    .eq('guest_id', host_guest_id)
    .eq('event_id', event_id)
    .maybeSingle();
  if (hostErr) return { ok: false, error: hostErr.message };
  if (!host) return { ok: false, error: 'Host guest not found.' };

  const hostTable = (host.table_number as string | null) ?? null;
  const hostCompany = (host.company as string | null) ?? null;

  // Resolve the companion's destination table per mode.
  let companionTable: string | null;
  let movedHost = false;
  switch (payload.mode) {
    case 'same':
    case 'override':
      companionTable = hostTable;
      break;
    case 'move_both': {
      const next = payload.new_table?.trim();
      if (!next) {
        return {
          ok: false,
          error: 'Pick a destination table for the move-both option.',
        };
      }
      companionTable = next;
      movedHost = next !== hostTable;
      break;
    }
    case 'split': {
      const next = payload.new_table?.trim();
      if (!next) {
        return {
          ok: false,
          error: 'Pick a table for the companion.',
        };
      }
      companionTable = next;
      break;
    }
    default:
      return { ok: false, error: 'Unknown companion mode.' };
  }

  // Compose notes: marker + free-text usher note. The marker is parseable
  // by post-event reports and links the companion back to the host.
  const userNote = payload.notes?.trim();
  const marker = `Walk-in +1 of ${host.full_name as string} (${host.guest_id as string})`;
  const composedNotes = userNote ? `${marker} · ${userNote}` : marker;

  const { data: inserted, error: insertErr } = await supabase
    .from('event_guests')
    .insert({
      event_id,
      full_name,
      title: payload.title?.trim() || null,
      // Default the companion's company to the host's so the post-event
      // report keeps the pair grouped if they share a firm. Usher can edit
      // later if it's actually a guest from elsewhere.
      company: payload.company?.trim() || hostCompany,
      contact_number: payload.contact_number?.trim() || null,
      email: payload.email?.trim() || null,
      table_number: companionTable,
      notes: composedNotes,
      checked_in: true,
    })
    .select('guest_id, full_name, company, title, table_number, checked_in_at')
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  // Move the host if mode === move_both AND it's a different table.
  if (movedHost) {
    const newTable = payload.new_table!.trim();
    const { error: hostUpdateErr } = await supabase
      .from('event_guests')
      .update({ table_number: newTable })
      .eq('guest_id', host_guest_id)
      .eq('event_id', event_id);
    if (hostUpdateErr) {
      // Companion is already in; surface the partial failure but don't roll
      // back — the usher can manually re-seat the host if the second write
      // fails. Log it so the audit trail catches the mismatch.
      console.error('kioskAddCompanionAction: host move failed', hostUpdateErr);
      return { ok: false, error: `Companion added but moving host failed: ${hostUpdateErr.message}` };
    }
  }

  // Audit feed:
  //   • companion_add — "<companion> was added as a +1 of <host>"
  //   • checkin       — keeps the rolling check-in count consistent
  //   • table_swap    — only when host moved (one row, attributed to host)
  //   • capacity_override — when destination is at-or-over its limit
  const baseAudit = {
    event_id,
    source: 'kiosk' as const,
    performed_by_user_id: user.id,
  };
  const auditRows: Array<typeof baseAudit & {
    guest_id: string;
    action: string;
    notes: string | null;
  }> = [
    {
      ...baseAudit,
      guest_id: inserted.guest_id as string,
      action: 'companion_add',
      notes: `+1 of ${host.full_name as string}`,
    },
    {
      ...baseAudit,
      guest_id: inserted.guest_id as string,
      action: 'checkin',
      notes: 'Companion initial check-in',
    },
  ];
  if (movedHost) {
    auditRows.push({
      ...baseAudit,
      guest_id: host_guest_id,
      action: 'table_swap',
      notes: `Moved from ${hostTable ?? '—'} → ${payload.new_table!.trim()} (with companion)`,
    });
  }
  if (payload.capacity_override && companionTable) {
    auditRows.push({
      ...baseAudit,
      guest_id: inserted.guest_id as string,
      action: 'capacity_override',
      notes: `Seated past capacity at table ${companionTable}`,
    });
  }
  await supabase.from('event_guest_checkins').insert(auditRows);

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);

  return {
    ok: true,
    guest: {
      guest_id: inserted.guest_id as string,
      full_name: inserted.full_name as string,
      company: (inserted.company as string | null) ?? null,
      title: (inserted.title as string | null) ?? null,
      table_number: (inserted.table_number as string | null) ?? null,
      checked_in_at: (inserted.checked_in_at as string | null) ?? null,
    },
    host_moved_to: movedHost ? payload.new_table!.trim() : null,
  };
}

// Used for the rare "I tapped the wrong row" undo path. Stays a separate
// action so the main kiosk button can never silently flip a check-in off.
export async function kioskUndoCheckInAction(
  event_id: string,
  guest_id: string,
): Promise<{ ok: boolean; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id || !guest_id) {
    return { ok: false, error: 'Missing event or guest id.' };
  }

  const { error } = await supabase
    .from('event_guests')
    .update({ checked_in: false })
    .eq('guest_id', guest_id)
    .eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  await supabase.from('event_guest_checkins').insert({
    guest_id,
    event_id,
    action: 'undo',
    source: 'kiosk',
    performed_by_user_id: user.id,
  });

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);
  return { ok: true, error: null };
}
