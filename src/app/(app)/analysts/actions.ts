'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { AnalystType } from '@/lib/types';
import {
  IMPORT_INITIAL,
  parseCsv,
  type ImportRowError,
  type ImportState,
} from '@/lib/csv';
import {
  ANALYST_IMPORT_HEADERS,
  ANALYST_TYPE_CODES,
} from '@/lib/analyst-import';

export type ActionState = { ok: boolean; error: string | null };

const ANALYST_TYPES: AnalystType[] = ['buy_side', 'sell_side'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type AnalystPayload = {
  full_name: string | null;
  institution_name: string;
  analyst_type: AnalystType;
  contact_number: string | null;
  email: string | null;
};

function readPayload(formData: FormData): { ok: true; value: AnalystPayload } | { ok: false; error: string } {
  const full_name = formData.get('full_name')?.toString().trim() || null;
  const institution_name = formData.get('institution_name')?.toString().trim();
  const analyst_type = formData.get('analyst_type')?.toString();
  const contact_number = formData.get('contact_number')?.toString().trim() || null;
  const email = formData.get('email')?.toString().trim() || null;

  if (!institution_name) return { ok: false, error: 'Institution name is required.' };
  if (!analyst_type || !ANALYST_TYPES.includes(analyst_type as AnalystType)) {
    return { ok: false, error: 'Analyst type is required.' };
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Email address looks invalid.' };
  }

  return {
    ok: true,
    value: {
      full_name,
      institution_name,
      analyst_type: analyst_type as AnalystType,
      contact_number,
      email,
    },
  };
}

export async function createAnalystAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('analysts').insert(payload.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/analysts');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateAnalystAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const investor_id = formData.get('investor_id')?.toString();
  if (!investor_id) return { ok: false, error: 'Missing investor id.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('analysts').update(payload.value).eq('investor_id', investor_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/analysts');
  revalidatePath('/dashboard');
  revalidatePath(`/analysts/${investor_id}`);
  return { ok: true, error: null };
}

export async function exportAnalystEmailsAction(
  q: string,
): Promise<{ emails: string[]; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { emails: [], error: 'You must be signed in.' };

  let query = supabase
    .from('analysts')
    .select('email')
    .not('email', 'is', null);

  const term = q.trim();
  if (term) {
    query = query.or(
      `full_name.ilike.%${term}%,institution_name.ilike.%${term}%,email.ilike.%${term}%`,
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

export async function deleteAnalystAction(investor_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!investor_id) return { ok: false, error: 'Missing investor id.' };

  const { error } = await supabase.from('analysts').delete().eq('investor_id', investor_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/analysts');
  revalidatePath('/meetings');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

// ---- Bulk import from CSV ----

export type { ImportRowError, ImportState };

type ImportPayload = {
  institution_name: string;
  full_name: string | null;
  analyst_type: AnalystType;
  email: string | null;
  contact_number: string | null;
};

function buildImportPayload(
  record: Record<string, string>,
): { ok: true; value: ImportPayload } | { ok: false; error: string } {
  const institution_name = record.institution_name?.trim();
  if (!institution_name) {
    return { ok: false, error: 'institution_name is required.' };
  }

  const type_raw = record.analyst_type?.trim();
  if (!type_raw || !ANALYST_TYPE_CODES.includes(type_raw as AnalystType)) {
    return {
      ok: false,
      error: `analyst_type must be one of: ${ANALYST_TYPE_CODES.join(', ')}.`,
    };
  }

  const email = record.email?.trim().toLowerCase() || null;
  if (email && !EMAIL_RE.test(email)) {
    return { ok: false, error: `email "${email}" is invalid.` };
  }

  return {
    ok: true,
    value: {
      institution_name,
      full_name: record.full_name?.trim() || null,
      analyst_type: type_raw as AnalystType,
      email,
      contact_number: record.contact_number?.trim() || null,
    },
  };
}

export async function importAnalystsAction(
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
  const required = ANALYST_IMPORT_HEADERS;
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

  const { error } = await supabase.from('analysts').insert(payloads);
  if (error) {
    return {
      ok: false,
      error: `Database error: ${error.message}`,
      imported: 0,
      skipped: errors.length + payloads.length,
      errors,
    };
  }

  revalidatePath('/analysts');
  revalidatePath('/dashboard');
  return {
    ok: true,
    error: null,
    imported: payloads.length,
    skipped: errors.length,
    errors,
  };
}
