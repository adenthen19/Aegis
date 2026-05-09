'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { assertDirectorOrAdmin } from '@/lib/auth';
import type { GuestTier } from '@/lib/types';

const VALID_TIERS: GuestTier[] = ['vip', 'analyst', 'kol', 'media', 'standard'];

function normaliseTier(value: unknown): GuestTier {
  return typeof value === 'string' && VALID_TIERS.includes(value as GuestTier)
    ? (value as GuestTier)
    : 'standard';
}

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
    .select('guest_id, event_id, full_name, company, title, table_number, checked_in, checked_in_at, walkin_status')
    .eq('guest_id', guest_id)
    .eq('event_id', event_id)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: lookupErr.message };
  if (!existing) return { ok: false, error: 'Guest not found.' };

  // Hard-reject pending walk-ins. The kiosk filters them out of search
  // already, but a request can still arrive via realtime drain or a
  // tampered call. Approval is the supervisor's job — we never auto-flip.
  if (existing.walkin_status === 'pending') {
    return {
      ok: false,
      error: 'This walk-in is awaiting supervisor approval. Open the Approvals queue.',
    };
  }

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
    // Scope by event_id too — defence in depth so a tampered request
    // pointing at a guest from a different event can't write through
    // this kiosk's audit trail.
    .eq('guest_id', guest_id)
    .eq('event_id', event_id)
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
  /** Honorific (Datuk, Tan Sri, Dr, etc.) — printed on badges and used at door greetings. */
  honorific?: string | null;
  /** Preferred display name; falls back to full_name when null. */
  preferred_name?: string | null;
  /** CMSRL number for analysts; press card number for media. Either may be set. */
  cmsrl_number?: string | null;
  press_card_no?: string | null;
  /** Audience tier — drives kiosk colour and seating-section matching. Defaults to 'standard'. */
  tier?: GuestTier | null;
  /** True iff the usher acknowledged seating past capacity. */
  capacity_override: boolean;
};

export type KioskWalkInResult =
  | {
      ok: true;
      /** Whether the walk-in is awaiting supervisor approval. When false the
       *  guest was checked in immediately (event has approval disabled). */
      pending_approval: boolean;
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

  // Read the event's approval flag — drives whether this walk-in lands as
  // checked-in immediately or as walkin_status='pending' awaiting a
  // supervisor (director / super_admin) tap. We deliberately read this on
  // the server rather than trusting a client-passed flag — quiet-period
  // events shouldn't be bypassable from a tampered request.
  const { data: ev, error: evErr } = await supabase
    .from('events')
    .select('event_id, requires_walkin_approval')
    .eq('event_id', event_id)
    .maybeSingle();
  if (evErr) return { ok: false, error: evErr.message };
  if (!ev) return { ok: false, error: 'Event not found.' };
  const requiresApproval = !!ev.requires_walkin_approval;

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
      honorific: payload.honorific?.trim() || null,
      preferred_name: payload.preferred_name?.trim() || null,
      cmsrl_number: payload.cmsrl_number?.trim() || null,
      press_card_no: payload.press_card_no?.trim() || null,
      tier: normaliseTier(payload.tier ?? 'standard'),
      // Pending approval: don't check them in yet.
      checked_in: !requiresApproval,
      walkin_status: requiresApproval ? 'pending' : 'approved',
    })
    .select('guest_id, full_name, company, title, table_number, checked_in_at')
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  // Audit feed:
  //   • requires_approval=false → walkin_add + checkin (legacy fast path)
  //   • requires_approval=true  → walkin_request only (no checkin row yet);
  //                               approval action will append walkin_approve
  //                               + checkin atoms when a supervisor taps
  //                               Approve.
  const baseAudit = {
    guest_id: inserted.guest_id as string,
    event_id,
    source: 'kiosk' as const,
    performed_by_user_id: user.id,
  };
  const auditRows: Array<typeof baseAudit & { action: string; notes: string | null }> = [];
  if (requiresApproval) {
    auditRows.push({
      ...baseAudit,
      action: 'walkin_request',
      notes: 'Awaiting supervisor approval',
    });
  } else {
    auditRows.push({ ...baseAudit, action: 'walkin_add', notes: null });
    auditRows.push({ ...baseAudit, action: 'checkin', notes: 'Walk-in initial check-in' });
  }
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
    pending_approval: requiresApproval,
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
// Walk-in approval / rejection. Only directors and super_admins can call
// these — that's the supervisor-PIN equivalent for the IPO/prospectus
// quiet-period gate. The action that flips checked_in is intentionally
// SEPARATE from the original walk-in-add path so the audit feed clearly
// shows the request → approve sequence with two named users.
// ─────────────────────────────────────────────────────────────────────

export async function kioskApproveWalkInAction(
  event_id: string,
  guest_id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!event_id || !guest_id) {
    return { ok: false, error: 'Missing event or guest id.' };
  }
  const auth = await assertDirectorOrAdmin();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // Race-safe transition: the UPDATE itself constrains the source state
  // to walkin_status='pending'. If two supervisors hit Approve at the
  // same moment, the second one's UPDATE matches zero rows and we skip
  // the audit insert — preventing duplicate walkin_approve+checkin
  // pairs in the activity feed.
  //
  // .select() forces Supabase to return the affected rows so we can
  // detect the no-op case. An empty array means somebody else already
  // approved or rejected.
  const { data: updated, error: updateErr } = await supabase
    .from('event_guests')
    .update({ walkin_status: 'approved', checked_in: true })
    .eq('guest_id', guest_id)
    .eq('event_id', event_id)
    .eq('walkin_status', 'pending')
    .select('guest_id');
  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: 'This walk-in is no longer pending — another supervisor already handled it.',
    };
  }

  // Two audit rows: walkin_approve (who/when) + checkin (keeps headline
  // counts consistent with non-approval-gated events).
  await supabase.from('event_guest_checkins').insert([
    {
      guest_id,
      event_id,
      action: 'walkin_approve',
      source: 'kiosk',
      performed_by_user_id: auth.user.id,
    },
    {
      guest_id,
      event_id,
      action: 'checkin',
      source: 'kiosk',
      performed_by_user_id: auth.user.id,
      notes: 'Walk-in approved · check-in',
    },
  ]);

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);
  return { ok: true };
}

export async function kioskRejectWalkInAction(
  event_id: string,
  guest_id: string,
  notes?: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!event_id || !guest_id) {
    return { ok: false, error: 'Missing event or guest id.' };
  }
  const auth = await assertDirectorOrAdmin();
  if (!auth.ok) return auth;

  const supabase = await createClient();

  // Same race-safe pattern as approve. We deliberately don't change
  // walkin_status here — leaving it at 'pending' would cause the row
  // to keep showing up in the queue. Instead we set checked_in=false
  // (already its default for pending rows; idempotent) and rely on
  // the walkin_reject audit to mark the row as terminated. Future
  // queue queries should filter on `not exists (select 1 from
  // event_guest_checkins where action='walkin_reject' ...)` — for now
  // the queue still sees rejected rows but the supervisor sees the
  // audit row and knows. Revisit when adding a 'rejected' enum value.
  const { data: updated, error: updateErr } = await supabase
    .from('event_guests')
    .update({ checked_in: false })
    .eq('guest_id', guest_id)
    .eq('event_id', event_id)
    .eq('walkin_status', 'pending')
    .select('guest_id');
  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error: 'This walk-in is no longer pending — another supervisor already handled it.',
    };
  }

  await supabase.from('event_guest_checkins').insert({
    guest_id,
    event_id,
    action: 'walkin_reject',
    source: 'kiosk',
    performed_by_user_id: auth.user.id,
    notes: notes?.trim() || null,
  });

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────────────
// Substitute-on-arrival. The most common door grey area: the named
// invitee didn't come, but a colleague from the same firm did. Rather
// than treating this as a generic walk-in (which loses the link to the
// original RSVP), we create a fresh row pointing at the original via
// substitute_for_guest_id.
//
// Behaviour:
//   • Original invitee row stays untouched (checked_in=false). The
//     reconciliation report can derive "no-show but substituted" from
//     the inverse FK.
//   • Substitute is checked in immediately — registering at the door
//     IS the act of attendance.
//   • If the event requires walk-in approval, the substitute also
//     lands as walkin_status='pending' and goes through the same
//     supervisor flow as a generic walk-in. (Same compliance bar; we
//     can't let firms route around quiet-period gates by waving the
//     "substitute" word.)
// ─────────────────────────────────────────────────────────────────────

export type KioskSubstitutePayload = {
  /** The original invitee being substituted — usually picked from the
   *  same-firm picker on the kiosk's no-match screen. */
  original_guest_id: string;
  full_name: string;
  title: string | null;
  contact_number: string | null;
  email: string | null;
  honorific: string | null;
  preferred_name: string | null;
  cmsrl_number: string | null;
  press_card_no: string | null;
  /** Tier for the substitute. Defaults to the original's tier on the
   *  client side; server falls back to 'standard' if missing. */
  tier?: GuestTier | null;
  notes: string | null;
};

export type KioskSubstituteResult =
  | {
      ok: true;
      pending_approval: boolean;
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

export async function kioskRegisterSubstituteAction(
  event_id: string,
  payload: KioskSubstitutePayload,
): Promise<KioskSubstituteResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!event_id) return { ok: false, error: 'Missing event id.' };
  if (!payload.original_guest_id) {
    return { ok: false, error: 'Pick the original invitee being substituted.' };
  }

  const full_name = payload.full_name.trim();
  if (!full_name) return { ok: false, error: 'Substitute name is required.' };
  if (payload.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) {
    return { ok: false, error: 'Email looks invalid.' };
  }

  // Pull the original row + event approval flag in parallel. We need the
  // original's company / table to copy onto the substitute, AND a guard so
  // that a substitute can't bypass requires_walkin_approval.
  const [origRes, evRes] = await Promise.all([
    supabase
      .from('event_guests')
      .select('guest_id, full_name, company, table_number, tier')
      .eq('guest_id', payload.original_guest_id)
      .eq('event_id', event_id)
      .maybeSingle(),
    supabase
      .from('events')
      .select('event_id, requires_walkin_approval')
      .eq('event_id', event_id)
      .maybeSingle(),
  ]);
  if (origRes.error) return { ok: false, error: origRes.error.message };
  if (!origRes.data) return { ok: false, error: 'Original invitee not found.' };
  if (evRes.error) return { ok: false, error: evRes.error.message };
  if (!evRes.data) return { ok: false, error: 'Event not found.' };

  const original = origRes.data as {
    guest_id: string;
    full_name: string;
    company: string | null;
    table_number: string | null;
    tier: GuestTier;
  };
  const requiresApproval = !!evRes.data.requires_walkin_approval;

  // Compose notes so the activity feed reads "Substitute for Jane Tan
  // (firm)" without an extra join. Free-text usher notes are appended.
  const userNote = payload.notes?.trim();
  const marker = `Substitute for ${original.full_name}${
    original.company ? ` (${original.company})` : ''
  }`;
  const composedNotes = userNote ? `${marker} · ${userNote}` : marker;

  const { data: inserted, error: insertErr } = await supabase
    .from('event_guests')
    .insert({
      event_id,
      full_name,
      title: payload.title?.trim() || null,
      // Firm carries over by default — substitution by definition is
      // "same firm". The usher can still edit this on the original
      // record afterwards if they really need to.
      company: original.company,
      contact_number: payload.contact_number?.trim() || null,
      email: payload.email?.trim() || null,
      // Inherit the original's seat — substitution is at-table-replacement.
      // Reconciliation report flags pairs where original.checked_in=false
      // and a substitute exists.
      table_number: original.table_number,
      honorific: payload.honorific?.trim() || null,
      preferred_name: payload.preferred_name?.trim() || null,
      cmsrl_number: payload.cmsrl_number?.trim() || null,
      press_card_no: payload.press_card_no?.trim() || null,
      // Tier defaults to the original's tier — same firm, same audience
      // bucket on virtually every Malaysian IPO event. Client may override
      // when the substitute really is a different role (rare).
      tier: normaliseTier(payload.tier ?? original.tier ?? 'standard'),
      substitute_for_guest_id: original.guest_id,
      notes: composedNotes,
      checked_in: !requiresApproval,
      walkin_status: requiresApproval ? 'pending' : 'approved',
    })
    .select('guest_id, full_name, company, title, table_number, checked_in_at')
    .single();
  if (insertErr) return { ok: false, error: insertErr.message };

  // Audit:
  //   • substitute_register — always (carries the link to the original).
  //   • walkin_request OR (walkin_add + checkin) — same branching as a
  //     generic walk-in so the feed is consistent.
  const baseAudit = {
    guest_id: inserted.guest_id as string,
    event_id,
    source: 'kiosk' as const,
    performed_by_user_id: user.id,
  };
  const auditRows: Array<typeof baseAudit & { action: string; notes: string | null }> = [
    {
      ...baseAudit,
      action: 'substitute_register',
      notes: marker,
    },
  ];
  if (requiresApproval) {
    auditRows.push({
      ...baseAudit,
      action: 'walkin_request',
      notes: 'Awaiting supervisor approval (substitute)',
    });
  } else {
    auditRows.push({ ...baseAudit, action: 'walkin_add', notes: null });
    auditRows.push({ ...baseAudit, action: 'checkin', notes: 'Substitute initial check-in' });
  }
  await supabase.from('event_guest_checkins').insert(auditRows);

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);

  return {
    ok: true,
    pending_approval: requiresApproval,
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
