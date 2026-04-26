-- Aegis 0016: documents
--
-- A single documents table is the home for every uploaded artifact —
-- press release drafts, Q&A packs, results decks, media kits, board packs,
-- coverage clippings, generated reports, etc. Files live in a private
-- Supabase Storage bucket; this table is the searchable metadata index.
--
-- Linkage model: every document is anchored to a client (denormalized for
-- "show me all documents for client X") and may *also* carry refinement
-- links to a more specific entity (engagement, commitment, schedule, meeting).
-- The press_release_id and media_coverage_id links will be added in the
-- Phase 2B migration when those tables exist.

-- =====================================================================
-- 1. ENUM
-- =====================================================================

do $$ begin
  create type document_category as enum (
    'press_release',
    'qa_pack',
    'media_kit',
    'results',
    'board_pack',
    'clipping',
    'report',
    'contract',
    'other'
  );
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. TABLE
-- =====================================================================

create table if not exists public.documents (
  document_id uuid primary key default gen_random_uuid(),
  -- Anchor — every document belongs to a client.
  client_id uuid not null references public.clients(client_id) on delete cascade,
  -- Optional refinement links. Each ON DELETE SET NULL — if the related
  -- entity is removed, the document survives (still attached to the client)
  -- so we don't accidentally lose contracts or coverage clippings.
  engagement_id uuid references public.engagements(engagement_id) on delete set null,
  client_deliverable_id uuid references public.client_deliverables(client_deliverable_id) on delete set null,
  schedule_id uuid references public.deliverable_schedule(schedule_id) on delete set null,
  meeting_id uuid references public.meetings(meeting_id) on delete set null,
  -- File details
  name varchar(255) not null,                 -- display name
  file_path text not null,                    -- storage object path
  mime_type varchar(127),
  size_bytes bigint,
  category document_category not null default 'other',
  description text,
  -- Lightweight version tracking. version starts at 1; a new upload that
  -- supersedes an earlier one sets replaces_document_id and bumps version.
  version int not null default 1,
  replaces_document_id uuid references public.documents(document_id) on delete set null,
  -- Audit columns
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists documents_client_idx on public.documents(client_id);
create index if not exists documents_engagement_idx on public.documents(engagement_id);
create index if not exists documents_deliverable_idx on public.documents(client_deliverable_id);
create index if not exists documents_schedule_idx on public.documents(schedule_id);
create index if not exists documents_meeting_idx on public.documents(meeting_id);
create index if not exists documents_category_idx on public.documents(client_id, category);

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

drop trigger if exists documents_set_audit_insert on public.documents;
create trigger documents_set_audit_insert before insert on public.documents
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists documents_set_audit_update on public.documents;
create trigger documents_set_audit_update before update on public.documents
  for each row execute function public.set_audit_user_on_update();

alter table public.documents enable row level security;

drop policy if exists "auth read documents" on public.documents;
create policy "auth read documents" on public.documents
  for select to authenticated using (true);

drop policy if exists "auth insert documents" on public.documents;
create policy "auth insert documents" on public.documents
  for insert to authenticated with check (true);

drop policy if exists "auth update documents" on public.documents;
create policy "auth update documents" on public.documents
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete documents" on public.documents;
create policy "auth delete documents" on public.documents
  for delete to authenticated using (true);

-- =====================================================================
-- 3. STORAGE BUCKET
-- =====================================================================
-- Private bucket — these are confidential client documents. We never expose
-- public URLs. Reads happen through signed URLs generated server-side per
-- request, with a short expiry. Files are pathed under {client_id}/{document_id}/
-- so a client deletion cascade can identify orphaned objects, and so we can
-- write per-client storage policies later if we add tenant isolation.

insert into storage.buckets (id, name, public)
values ('documents', 'documents', false)
on conflict (id) do nothing;

drop policy if exists "auth read documents bucket" on storage.objects;
create policy "auth read documents bucket"
  on storage.objects for select to authenticated
  using (bucket_id = 'documents');

drop policy if exists "auth upload documents bucket" on storage.objects;
create policy "auth upload documents bucket"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'documents');

drop policy if exists "auth update documents bucket" on storage.objects;
create policy "auth update documents bucket"
  on storage.objects for update to authenticated
  using (bucket_id = 'documents')
  with check (bucket_id = 'documents');

drop policy if exists "auth delete documents bucket" on storage.objects;
create policy "auth delete documents bucket"
  on storage.objects for delete to authenticated
  using (bucket_id = 'documents');
