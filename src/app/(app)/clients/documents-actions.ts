'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { DocumentCategory } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const BUCKET = 'documents';
const MAX_BYTES = 25 * 1024 * 1024; // 25 MB

const CATEGORIES: DocumentCategory[] = [
  'press_release',
  'qa_pack',
  'media_kit',
  'results',
  'board_pack',
  'clipping',
  'report',
  'contract',
  'other',
];

function sanitizeFilename(name: string): string {
  // Keep extension, replace anything not in [A-Za-z0-9._-] with underscore.
  // We're stashing files under a UUID folder anyway so collision risk is zero;
  // this is just to keep paths URL-safe.
  return name.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200) || 'file';
}

function pickPath(client_id: string, document_id: string, filename: string): string {
  return `${client_id}/${document_id}/${sanitizeFilename(filename)}`;
}

function revalidateAll(client_id: string | null | undefined) {
  if (client_id) revalidatePath(`/clients/${client_id}`);
}

export async function uploadDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Please choose a file.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, error: 'File is too large (limit 25 MB).' };
  }

  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const category_raw = formData.get('category')?.toString() ?? 'other';
  const category: DocumentCategory = CATEGORIES.includes(
    category_raw as DocumentCategory,
  )
    ? (category_raw as DocumentCategory)
    : 'other';

  const display_name =
    formData.get('name')?.toString().trim() || file.name || 'Untitled';
  const description = formData.get('description')?.toString().trim() || null;

  // Optional refinement links — passed through if present.
  const engagement_id = formData.get('engagement_id')?.toString() || null;
  const client_deliverable_id =
    formData.get('client_deliverable_id')?.toString() || null;
  const schedule_id = formData.get('schedule_id')?.toString() || null;
  const meeting_id = formData.get('meeting_id')?.toString() || null;
  const replaces_document_id =
    formData.get('replaces_document_id')?.toString() || null;

  // Compute version + the document_id up front so the storage path is stable.
  const document_id = crypto.randomUUID();
  let version = 1;
  if (replaces_document_id) {
    const { data: prior } = await supabase
      .from('documents')
      .select('version')
      .eq('document_id', replaces_document_id)
      .maybeSingle();
    if (prior?.version) version = (prior.version as number) + 1;
  }

  const path = pickPath(client_id, document_id, file.name);

  // Upload to Storage first. If the metadata insert fails we'll clean up.
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });
  if (upErr) return { ok: false, error: upErr.message };

  const { error: insErr } = await supabase.from('documents').insert({
    document_id,
    client_id,
    engagement_id,
    client_deliverable_id,
    schedule_id,
    meeting_id,
    name: display_name,
    file_path: path,
    mime_type: file.type || null,
    size_bytes: file.size,
    category,
    description,
    version,
    replaces_document_id,
  });
  if (insErr) {
    // Roll back the upload so we don't leave orphaned bytes in the bucket.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insErr.message };
  }

  revalidateAll(client_id);
  return { ok: true, error: null };
}

export async function deleteDocumentAction(
  document_id: string,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!document_id) return { ok: false, error: 'Missing document id.' };

  const { data: row } = await supabase
    .from('documents')
    .select('client_id, file_path')
    .eq('document_id', document_id)
    .maybeSingle();
  if (!row) return { ok: false, error: 'Document not found.' };

  // Delete the storage object first; if that fails we leave the metadata
  // alone so we don't lose the pointer to a half-deleted file.
  const { error: rmErr } = await supabase.storage
    .from(BUCKET)
    .remove([row.file_path as string]);
  if (rmErr) return { ok: false, error: rmErr.message };

  const { error: delErr } = await supabase
    .from('documents')
    .delete()
    .eq('document_id', document_id);
  if (delErr) return { ok: false, error: delErr.message };

  revalidateAll(row.client_id as string | null);
  return { ok: true, error: null };
}

export async function getDocumentDownloadUrlAction(
  document_id: string,
): Promise<{ ok: boolean; url: string | null; error: string | null }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, url: null, error: 'You must be signed in.' };
  }
  if (!document_id) {
    return { ok: false, url: null, error: 'Missing document id.' };
  }

  const { data: row } = await supabase
    .from('documents')
    .select('file_path')
    .eq('document_id', document_id)
    .maybeSingle();
  if (!row) {
    return { ok: false, url: null, error: 'Document not found.' };
  }

  // Signed URL valid for 60 seconds — long enough for the user to click the
  // link, short enough that it can't be shared meaningfully.
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path as string, 60);
  if (error || !data) {
    return { ok: false, url: null, error: error?.message ?? 'Could not sign URL.' };
  }
  return { ok: true, url: data.signedUrl, error: null };
}
