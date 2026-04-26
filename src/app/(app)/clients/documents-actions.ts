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

type CommonFormFields = {
  client_id: string;
  category: DocumentCategory;
  name: string | null;
  description: string | null;
  engagement_id: string | null;
  client_deliverable_id: string | null;
  schedule_id: string | null;
  meeting_id: string | null;
  press_release_id: string | null;
  coverage_id: string | null;
  pr_value_report_id: string | null;
  replaces_document_id: string | null;
};

function readCommonFields(formData: FormData):
  | { ok: true; value: CommonFormFields }
  | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString();
  if (!client_id) return { ok: false, error: 'Missing client id.' };

  const category_raw = formData.get('category')?.toString() ?? 'other';
  const category: DocumentCategory = CATEGORIES.includes(
    category_raw as DocumentCategory,
  )
    ? (category_raw as DocumentCategory)
    : 'other';

  return {
    ok: true,
    value: {
      client_id,
      category,
      name: formData.get('name')?.toString().trim() || null,
      description: formData.get('description')?.toString().trim() || null,
      engagement_id: formData.get('engagement_id')?.toString() || null,
      client_deliverable_id:
        formData.get('client_deliverable_id')?.toString() || null,
      schedule_id: formData.get('schedule_id')?.toString() || null,
      meeting_id: formData.get('meeting_id')?.toString() || null,
      press_release_id: formData.get('press_release_id')?.toString() || null,
      coverage_id: formData.get('coverage_id')?.toString() || null,
      pr_value_report_id:
        formData.get('pr_value_report_id')?.toString() || null,
      replaces_document_id:
        formData.get('replaces_document_id')?.toString() || null,
    },
  };
}

async function nextVersion(
  supabase: Awaited<ReturnType<typeof createClient>>,
  replaces_document_id: string | null,
): Promise<number> {
  if (!replaces_document_id) return 1;
  const { data: prior } = await supabase
    .from('documents')
    .select('version')
    .eq('document_id', replaces_document_id)
    .maybeSingle();
  return prior?.version ? (prior.version as number) + 1 : 1;
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

  const common = readCommonFields(formData);
  if (!common.ok) return { ok: false, error: common.error };
  const c = common.value;
  const display_name = c.name || file.name || 'Untitled';

  // Compute version + the document_id up front so the storage path is stable.
  const document_id = crypto.randomUUID();
  const version = await nextVersion(supabase, c.replaces_document_id);

  const path = pickPath(c.client_id, document_id, file.name);

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
    client_id: c.client_id,
    engagement_id: c.engagement_id,
    client_deliverable_id: c.client_deliverable_id,
    schedule_id: c.schedule_id,
    meeting_id: c.meeting_id,
    press_release_id: c.press_release_id,
    coverage_id: c.coverage_id,
    pr_value_report_id: c.pr_value_report_id,
    name: display_name,
    file_path: path,
    external_url: null,
    mime_type: file.type || null,
    size_bytes: file.size,
    category: c.category,
    description: c.description,
    version,
    replaces_document_id: c.replaces_document_id,
  });
  if (insErr) {
    // Roll back the upload so we don't leave orphaned bytes in the bucket.
    await supabase.storage.from(BUCKET).remove([path]);
    return { ok: false, error: insErr.message };
  }

  revalidateAll(c.client_id);
  return { ok: true, error: null };
}

export async function linkExternalDocumentAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const url = formData.get('external_url')?.toString().trim() ?? '';
  if (!url) return { ok: false, error: 'Paste a URL.' };
  // Light validation — must look like an HTTP(S) URL. We don't want to
  // hand-roll a strict parser; the Drive picker would normally do this for us.
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'URL must start with http:// or https://.' };
    }
  } catch {
    return { ok: false, error: 'That doesn’t look like a valid URL.' };
  }

  const common = readCommonFields(formData);
  if (!common.ok) return { ok: false, error: common.error };
  const c = common.value;
  const display_name = c.name || 'Linked document';

  const version = await nextVersion(supabase, c.replaces_document_id);

  const { error } = await supabase.from('documents').insert({
    client_id: c.client_id,
    engagement_id: c.engagement_id,
    client_deliverable_id: c.client_deliverable_id,
    schedule_id: c.schedule_id,
    meeting_id: c.meeting_id,
    press_release_id: c.press_release_id,
    coverage_id: c.coverage_id,
    pr_value_report_id: c.pr_value_report_id,
    name: display_name,
    file_path: null,
    external_url: url,
    mime_type: null,
    size_bytes: null,
    category: c.category,
    description: c.description,
    version,
    replaces_document_id: c.replaces_document_id,
  });
  if (error) return { ok: false, error: error.message };

  revalidateAll(c.client_id);
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
    .select('client_id, file_path, external_url')
    .eq('document_id', document_id)
    .maybeSingle();
  if (!row) return { ok: false, error: 'Document not found.' };

  // For uploaded files, delete the storage object first so we don't orphan
  // it if the row delete fails. For external links there's nothing to clean
  // up beyond the row itself.
  if (row.file_path) {
    const { error: rmErr } = await supabase.storage
      .from(BUCKET)
      .remove([row.file_path as string]);
    if (rmErr) return { ok: false, error: rmErr.message };
  }

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
    .select('file_path, external_url')
    .eq('document_id', document_id)
    .maybeSingle();
  if (!row) {
    return { ok: false, url: null, error: 'Document not found.' };
  }

  // External link — return the URL as-is. The caller opens it in a new tab.
  // Auth on the destination (Drive, SharePoint, etc.) is the user's problem.
  if (row.external_url) {
    return { ok: true, url: row.external_url as string, error: null };
  }

  if (!row.file_path) {
    return { ok: false, url: null, error: 'Document has no file or link.' };
  }

  // Storage file — sign a short-lived URL. 60 s is enough for the click,
  // short enough that it can't be re-shared meaningfully.
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(row.file_path as string, 60);
  if (error || !data) {
    return { ok: false, url: null, error: error?.message ?? 'Could not sign URL.' };
  }
  return { ok: true, url: data.signedUrl, error: null };
}
