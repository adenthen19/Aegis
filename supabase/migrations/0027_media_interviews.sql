-- Aegis 0027: media interviews
--
-- Records each one-on-one interview between a client spokesperson and a
-- journalist. Distinct from media_coverage (which captures the *published*
-- article) — the interview itself is the encounter, often days/weeks before
-- publication, and not every interview produces coverage. Distinct from
-- press_releases — interviews are inbound (or scheduled outbound) reporter
-- engagements, not formal release distribution.
--
-- Lifecycle:
--   1. Schedule    — interview booked, status='scheduled'
--   2. Complete    — interview happened, status='completed'
--                    + bumps the linked recurring "media interviews" commitment
--                      counter so the engagement on-track view stays accurate
--   3. (optional) Coverage — when the article publishes, link the interview to
--      the resulting media_coverage row via coverage_id
--
-- Relationship choices:
--   • media_id (FK)        : prefers structured outlet from media_contacts
--   • publication_name     : free-text fallback for ad-hoc / new outlets
--                            (and kept as a stable label even when media_id is set)
--   • coverage_id (FK null): links to the published article when it runs
--   • client_deliverable_id: optional link to the recurring "media interviews"
--                            commitment under the engagement
--   • engagement_id        : scope (defaulted to active engagement at create)

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  create type interview_format as enum (
    'in_person',
    'phone',
    'video',
    'email'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type interview_status as enum (
    'scheduled',
    'completed',
    'cancelled',
    'postponed'
  );
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. TABLE
-- =====================================================================

create table if not exists public.media_interviews (
  interview_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  -- Optional engagement scope; defaulted from the active engagement at create.
  engagement_id uuid references public.engagements(engagement_id) on delete set null,
  -- Optional link to the recurring "media interviews" commitment so completing
  -- an interview auto-bumps the engagement's on-track counter.
  client_deliverable_id uuid
    references public.client_deliverables(client_deliverable_id) on delete set null,
  -- Optional structured outlet. Either media_id, publication_name, or both
  -- must be set. publication_name is preserved as a stable label even when
  -- media_id is filled (matches the media_coverage pattern).
  media_id uuid references public.media_contacts(media_id) on delete set null,
  publication_name varchar(255),
  reporter_name varchar(255),
  spokesperson_name varchar(255),
  interview_date timestamptz not null,
  interview_format interview_format not null default 'in_person',
  status interview_status not null default 'scheduled',
  topic text,
  expected_publish_date date,
  -- Filled when the resulting article is logged in media_coverage.
  coverage_id uuid references public.media_coverage(coverage_id) on delete set null,
  notes text,
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint media_interviews_outlet_check
    check (media_id is not null or (publication_name is not null and length(trim(publication_name)) > 0))
);

create index if not exists media_interviews_client_idx
  on public.media_interviews(client_id);
create index if not exists media_interviews_engagement_idx
  on public.media_interviews(engagement_id);
create index if not exists media_interviews_status_idx
  on public.media_interviews(client_id, status);
create index if not exists media_interviews_date_idx
  on public.media_interviews(interview_date desc);
create index if not exists media_interviews_media_idx
  on public.media_interviews(media_id);
create index if not exists media_interviews_coverage_idx
  on public.media_interviews(coverage_id);
create index if not exists media_interviews_created_by_idx
  on public.media_interviews(created_by_user_id);

-- =====================================================================
-- 3. TRIGGERS
-- =====================================================================

drop trigger if exists media_interviews_set_updated_at on public.media_interviews;
create trigger media_interviews_set_updated_at before update on public.media_interviews
  for each row execute function public.set_updated_at();

drop trigger if exists media_interviews_set_audit_insert on public.media_interviews;
create trigger media_interviews_set_audit_insert before insert on public.media_interviews
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists media_interviews_set_audit_update on public.media_interviews;
create trigger media_interviews_set_audit_update before update on public.media_interviews
  for each row execute function public.set_audit_user_on_update();

-- =====================================================================
-- 4. RLS
-- =====================================================================

alter table public.media_interviews enable row level security;

drop policy if exists "auth read media_interviews" on public.media_interviews;
create policy "auth read media_interviews" on public.media_interviews
  for select to authenticated using (true);

drop policy if exists "auth insert media_interviews" on public.media_interviews;
create policy "auth insert media_interviews" on public.media_interviews
  for insert to authenticated with check (true);

drop policy if exists "auth update media_interviews" on public.media_interviews;
create policy "auth update media_interviews" on public.media_interviews
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete media_interviews" on public.media_interviews;
create policy "auth delete media_interviews" on public.media_interviews
  for delete to authenticated using (true);
