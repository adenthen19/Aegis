'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import {
  IMPORT_INITIAL,
  parseCsv,
  type ImportRowError,
  type ImportState,
} from '@/lib/csv';
import { MEDIA_IMPORT_HEADERS } from '@/lib/media-import';

export type ActionState = { ok: boolean; error: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MediaPayload = {
  full_name: string;
  company_name: string | null;
  state: string | null;
  contact_number: string | null;
  email: string | null;
};

function readPayload(formData: FormData): { ok: true; value: MediaPayload } | { ok: false; error: string } {
  const full_name = formData.get('full_name')?.toString().trim();
  const company_name = formData.get('company_name')?.toString().trim() || null;
  const state = formData.get('state')?.toString().trim() || null;
  const contact_number = formData.get('contact_number')?.toString().trim() || null;
  const email = formData.get('email')?.toString().trim() || null;

  if (!full_name) return { ok: false, error: 'Name is required.' };
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email address looks invalid.' };
  }

  return {
    ok: true,
    value: { full_name, company_name, state, contact_number, email },
  };
}

export async function createMediaContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('media_contacts').insert(payload.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/media');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateMediaContactAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const media_id = formData.get('media_id')?.toString();
  if (!media_id) return { ok: false, error: 'Missing media id.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('media_contacts').update(payload.value).eq('media_id', media_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/media');
  revalidatePath('/dashboard');
  revalidatePath(`/media/${media_id}`);
  return { ok: true, error: null };
}

export async function exportMediaEmailsAction(
  q: string,
): Promise<{ emails: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { emails: [], error: 'You must be signed in.' };

  let query = supabase
    .from('media_contacts')
    .select('email')
    .not('email', 'is', null);

  const term = q.trim();
  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,company_name.ilike.%${term}%,email.ilike.%${term}%,state.ilike.%${term}%`,
    );
  }

  const { data, error } = await query.order('email', { ascending: true });
  if (error) return { emails: [], error: error.message };

  const emails = Array.from(
    new Set(
      (data ?? [])
        .map((r) => (r.email ?? '').trim())
        .filter((e) => e.length > 0),
    ),
  );
  return { emails, error: null };
}

export async function deleteMediaContactAction(media_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!media_id) return { ok: false, error: 'Missing media id.' };

  const { error } = await supabase.from('media_contacts').delete().eq('media_id', media_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/media');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

// ---- Bulk import from CSV ----

export type { ImportRowError, ImportState };

type ImportPayload = {
  full_name: string;
  company_name: string | null;
  state: string | null;
  email: string | null;
  contact_number: string | null;
};

function buildImportPayload(
  record: Record<string, string>,
): { ok: true; value: ImportPayload } | { ok: false; error: string } {
  const full_name = record.full_name?.trim();
  if (!full_name) return { ok: false, error: 'full_name is required.' };

  const email = record.email?.trim().toLowerCase() || null;
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: `email "${email}" is invalid.` };
  }

  return {
    ok: true,
    value: {
      full_name,
      company_name: record.company_name?.trim() || null,
      state: record.state?.trim() || null,
      email,
      contact_number: record.contact_number?.trim() || null,
    },
  };
}

export async function importMediaContactsAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ...IMPORT_INITIAL, error: 'You must be signed in.' };

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
  const required = MEDIA_IMPORT_HEADERS;
  const missing = required.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return {
      ...IMPORT_INITIAL,
      error: `Missing required column(s): ${missing.join(', ')}. Download a fresh template and re-paste your data.`,
    };
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    return { ...IMPORT_INITIAL, error: 'No data rows found beneath the header row.' };
  }

  const payloads: ImportPayload[] = [];
  const errors: ImportRowError[] = [];

  dataRows.forEach((row, idx) => {
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = row[i] ?? '';
    });
    const built = buildImportPayload(record);
    if (built.ok) payloads.push(built.value);
    else errors.push({ row: idx + 2, message: built.error });
  });

  if (payloads.length === 0) {
    return {
      ok: false,
      error: 'No valid rows to import. Fix the errors below and try again.',
      imported: 0,
      skipped: errors.length,
      errors,
    };
  }

  const { error } = await supabase.from('media_contacts').insert(payloads);
  if (error) {
    return {
      ok: false,
      error: `Database error: ${error.message}`,
      imported: 0,
      skipped: errors.length + payloads.length,
      errors,
    };
  }

  revalidatePath('/media');
  revalidatePath('/dashboard');
  return {
    ok: true,
    error: null,
    imported: payloads.length,
    skipped: errors.length,
    errors,
  };
}
