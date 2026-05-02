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

  revalidatePath(`/kiosk/${event_id}`);
  revalidatePath(`/events/${event_id}`);
  return { ok: true, error: null };
}
