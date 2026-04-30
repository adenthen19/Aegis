'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { EventStatus } from '@/lib/types';
import {
  IMPORT_INITIAL,
  parseCsv,
  type ImportRowError,
  type ImportState,
} from '@/lib/csv';
import { EVENT_GUEST_IMPORT_HEADERS } from '@/lib/event-import';

export type ActionState = { ok: boolean; error: string | null };

const STATUSES: EventStatus[] = ['planned', 'ongoing', 'completed', 'cancelled'];

type EventPayload = {
  client_id: string | null;
  adhoc_client_name: string | null;
  name: string;
  event_date: string;
  location: string | null;
  description: string | null;
  status: EventStatus;
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
// Guests CRUD
// ────────────────────────────────────────────────────────────────────────

type GuestPayload = {
  full_name: string;
  title: string | null;
  company: string | null;
  contact_number: string | null;
  email: string | null;
  notes: string | null;
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
      notes: formData.get('notes')?.toString().trim() || null,
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

  // checked_in_at is set/cleared by the BEFORE trigger; we only flip the flag.
  const { data: row, error } = await supabase
    .from('event_guests')
    .update({ checked_in: next })
    .eq('guest_id', guest_id)
    .select('event_id')
    .single();
  if (error) return { ok: false, error: error.message };

  if (row?.event_id) revalidatePath(`/events/${row.event_id as string}`);
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

  const { error } = await supabase
    .from('event_guests')
    .update({ checked_in: next })
    .eq('event_id', event_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/events/${event_id}`);
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
      notes: record.notes?.trim() || null,
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
