'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import type { ProjectStatus } from '@/lib/types';

export type ActionState = { ok: boolean; error: string | null };

const STATUSES: ProjectStatus[] = ['pending', 'upcoming', 'completed'];

type ProjectPayload = {
  client_id: string;
  deliverable_name: string;
  status: ProjectStatus;
  deadline: string | null;
};

function readPayload(formData: FormData): { ok: true; value: ProjectPayload } | { ok: false; error: string } {
  const client_id = formData.get('client_id')?.toString();
  const deliverable_name = formData.get('deliverable_name')?.toString().trim();
  const status_raw = formData.get('status')?.toString();
  const deadline = formData.get('deadline')?.toString() || null;

  if (!client_id) return { ok: false, error: 'Client is required.' };
  if (!deliverable_name) return { ok: false, error: 'Deliverable name is required.' };
  const status =
    status_raw && STATUSES.includes(status_raw as ProjectStatus)
      ? (status_raw as ProjectStatus)
      : 'pending';

  return {
    ok: true,
    value: { client_id, deliverable_name, status, deadline },
  };
}

export async function createProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('projects').insert(payload.value);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/projects');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function updateProjectAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };

  const project_id = formData.get('project_id')?.toString();
  if (!project_id) return { ok: false, error: 'Missing project id.' };

  const payload = readPayload(formData);
  if (!payload.ok) return { ok: false, error: payload.error };

  const { error } = await supabase.from('projects').update(payload.value).eq('project_id', project_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/projects');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}

export async function deleteProjectAction(project_id: string): Promise<ActionState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You must be signed in.' };
  if (!project_id) return { ok: false, error: 'Missing project id.' };

  const { error } = await supabase.from('projects').delete().eq('project_id', project_id);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/projects');
  revalidatePath('/dashboard');
  return { ok: true, error: null };
}
