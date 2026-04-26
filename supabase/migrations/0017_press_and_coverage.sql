-- Aegis 0017: press releases, media coverage, PR value reports
--
-- The end-to-end PR pipeline:
--   1. Draft a press release   → press_releases (status='draft')
--   2. Approve internally      → press_releases (status='approved')
--   3. Distribute to media     → press_releases (status='distributed', distributed_at)
--                                + bumps the linked recurring "press release" commitment counter
--   4. Track coverage          → media_coverage rows linked back to the press release
--                                (URL for online, PDF clipping via documents table)
--   5. Generate PR value report → pr_value_reports for a date range, sums coverage,
--                                  optionally exports a PDF (saved as a document) and
--                                  marks "sent to client" once delivered.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  create type press_release_type as enum (
    'results',          -- quarterly / annual results
    'corporate_action', -- M&A, capital raising, dividend, etc.
    'ipo',              -- IPO-specific (prospectus, listing)
    'agm_egm',          -- AGM / EGM notice or outcome
    'esg',              -- ESG / sustainability
    'product',          -- new product / contract win
    'crisis',           -- crisis communications
    'ad_hoc',           -- everything else
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type press_release_status as enum (
    'draft',
    'approved',
    'distributed',
    'archived'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type coverage_type as enum ('online', 'print', 'broadcast', 'social');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type coverage_sentiment as enum ('positive', 'neutral', 'negative');
exception when duplicate_object then null;
end $$;

-- Extend the documents category enum so coverage clippings + generated PR
-- value reports can be filed correctly. Postgres requires ADD VALUE to run
-- outside a transaction; the standard workaround is the IF NOT EXISTS guard.
alter type document_category add value if not exists 'pr_value_report';

-- =====================================================================
-- 2. PRESS RELEASES
-- =====================================================================

create table if not exists public.press_releases (
  press_release_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  -- Optional engagement scope; populated from the active engagement at create time.
  engagement_id uuid references public.engagements(engagement_id) on delete set null,
  -- Optional link to the recurring "press releases" commitment so distributing
  -- a release auto-bumps the on-track counter for the engagement.
  client_deliverable_id uuid
    references public.client_deliverables(client_deliverable_id) on delete set null,
  title varchar(255) not null,
  release_type press_release_type not null default 'ad_hoc',
  status press_release_status not null default 'draft',
  -- The headline date the release carries (often forward-dated until distribution).
  release_date date,
  -- Set when status flips to distributed.
  distributed_at timestamptz,
  -- Body kept inline for full-text search + light edits. The formatted file
  -- (PDF/DOCX as actually distributed) lives as a document attached via
  -- documents.press_release_id.
  body text,
  -- Distribution list — array of media_contact ids that received the release.
  -- We store ids rather than a junction table because order doesn't matter
  -- and we never query "which releases did contact X receive" enough to
  -- justify a separate table. If that changes we promote it later.
  distribution_media_ids uuid[] not null default '{}',
  -- Free-text fallback for outlets we haven't yet captured in media_contacts.
  distribution_notes text,
  notes text,
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists press_releases_client_idx on public.press_releases(client_id);
create index if not exists press_releases_engagement_idx on public.press_releases(engagement_id);
create index if not exists press_releases_status_idx on public.press_releases(client_id, status);
create index if not exists press_releases_release_date_idx
  on public.press_releases(release_date desc);

drop trigger if exists press_releases_set_updated_at on public.press_releases;
create trigger press_releases_set_updated_at before update on public.press_releases
  for each row execute function public.set_updated_at();

drop trigger if exists press_releases_set_audit_insert on public.press_releases;
create trigger press_releases_set_audit_insert before insert on public.press_releases
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists press_releases_set_audit_update on public.press_releases;
create trigger press_releases_set_audit_update before update on public.press_releases
  for each row execute function public.set_audit_user_on_update();

alter table public.press_releases enable row level security;

drop policy if exists "auth read press_releases" on public.press_releases;
create policy "auth read press_releases" on public.press_releases
  for select to authenticated using (true);
drop policy if exists "auth insert press_releases" on public.press_releases;
create policy "auth insert press_releases" on public.press_releases
  for insert to authenticated with check (true);
drop policy if exists "auth update press_releases" on public.press_releases;
create policy "auth update press_releases" on public.press_releases
  for update to authenticated using (true) with check (true);
drop policy if exists "auth delete press_releases" on public.press_releases;
create policy "auth delete press_releases" on public.press_releases
  for delete to authenticated using (true);

-- =====================================================================
-- 3. MEDIA COVERAGE
-- =====================================================================
-- Each row is one piece of coverage. Coverage may be triggered by a specific
-- press release (most cases) or arise organically (ad-hoc reporter outreach,
-- analyst note that quotes the company) — hence press_release_id is nullable.

create table if not exists public.media_coverage (
  coverage_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  press_release_id uuid
    references public.press_releases(press_release_id) on delete set null,
  -- Which outlet. Prefer the structured FK; fall back to text if the outlet
  -- isn't in our media contacts yet.
  media_id uuid references public.media_contacts(media_id) on delete set null,
  publication_name varchar(255) not null,
  reporter_name varchar(255),
  coverage_type coverage_type not null,
  publication_date date not null,
  headline text not null,
  -- Online: URL is set, PDF clipping is optional.
  -- Print/broadcast: URL is null, the PDF clipping is attached via the
  -- documents table with documents.coverage_id pointing back here.
  url text,
  reach_estimate bigint,
  sentiment coverage_sentiment,
  tone_tags text[] not null default '{}',
  -- Advertising Value Equivalent (legacy IR/PR metric, equivalent ad cost).
  ave_value numeric(12, 2),
  -- Modern PR Value (reach × engagement × sentiment multipliers).
  prv_value numeric(12, 2),
  currency varchar(3) not null default 'MYR',
  notes text,
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists media_coverage_client_idx on public.media_coverage(client_id);
create index if not exists media_coverage_press_release_idx on public.media_coverage(press_release_id);
create index if not exists media_coverage_publication_date_idx
  on public.media_coverage(publication_date desc);
create index if not exists media_coverage_media_idx on public.media_coverage(media_id);

drop trigger if exists media_coverage_set_updated_at on public.media_coverage;
create trigger media_coverage_set_updated_at before update on public.media_coverage
  for each row execute function public.set_updated_at();

drop trigger if exists media_coverage_set_audit_insert on public.media_coverage;
create trigger media_coverage_set_audit_insert before insert on public.media_coverage
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists media_coverage_set_audit_update on public.media_coverage;
create trigger media_coverage_set_audit_update before update on public.media_coverage
  for each row execute function public.set_audit_user_on_update();

alter table public.media_coverage enable row level security;

drop policy if exists "auth read media_coverage" on public.media_coverage;
create policy "auth read media_coverage" on public.media_coverage
  for select to authenticated using (true);
drop policy if exists "auth insert media_coverage" on public.media_coverage;
create policy "auth insert media_coverage" on public.media_coverage
  for insert to authenticated with check (true);
drop policy if exists "auth update media_coverage" on public.media_coverage;
create policy "auth update media_coverage" on public.media_coverage
  for update to authenticated using (true) with check (true);
drop policy if exists "auth delete media_coverage" on public.media_coverage;
create policy "auth delete media_coverage" on public.media_coverage
  for delete to authenticated using (true);

-- =====================================================================
-- 4. PR VALUE REPORTS
-- =====================================================================
-- Reports aggregate coverage rows over a period for a client. Totals are
-- cached at generation time so historical reports stay stable as new coverage
-- is added afterwards. The optional generated_pdf_document_id points at a
-- documents row (category='pr_value_report') if/when the team exports a PDF.

create table if not exists public.pr_value_reports (
  report_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  engagement_id uuid references public.engagements(engagement_id) on delete set null,
  title varchar(255) not null,
  period_start date not null,
  period_end date not null,
  total_coverage_count integer not null default 0,
  total_reach bigint not null default 0,
  total_ave numeric(14, 2) not null default 0,
  total_prv numeric(14, 2) not null default 0,
  currency varchar(3) not null default 'MYR',
  notes text,
  generated_pdf_document_id uuid references public.documents(document_id) on delete set null,
  sent_to_client_at timestamptz,
  sent_to_email varchar(255),
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pr_value_reports_dates_check check (period_end >= period_start)
);

create index if not exists pr_value_reports_client_idx on public.pr_value_reports(client_id);
create index if not exists pr_value_reports_engagement_idx on public.pr_value_reports(engagement_id);
create index if not exists pr_value_reports_period_idx
  on public.pr_value_reports(client_id, period_end desc);

drop trigger if exists pr_value_reports_set_updated_at on public.pr_value_reports;
create trigger pr_value_reports_set_updated_at before update on public.pr_value_reports
  for each row execute function public.set_updated_at();

drop trigger if exists pr_value_reports_set_audit_insert on public.pr_value_reports;
create trigger pr_value_reports_set_audit_insert before insert on public.pr_value_reports
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists pr_value_reports_set_audit_update on public.pr_value_reports;
create trigger pr_value_reports_set_audit_update before update on public.pr_value_reports
  for each row execute function public.set_audit_user_on_update();

alter table public.pr_value_reports enable row level security;

drop policy if exists "auth read pr_value_reports" on public.pr_value_reports;
create policy "auth read pr_value_reports" on public.pr_value_reports
  for select to authenticated using (true);
drop policy if exists "auth insert pr_value_reports" on public.pr_value_reports;
create policy "auth insert pr_value_reports" on public.pr_value_reports
  for insert to authenticated with check (true);
drop policy if exists "auth update pr_value_reports" on public.pr_value_reports;
create policy "auth update pr_value_reports" on public.pr_value_reports
  for update to authenticated using (true) with check (true);
drop policy if exists "auth delete pr_value_reports" on public.pr_value_reports;
create policy "auth delete pr_value_reports" on public.pr_value_reports
  for delete to authenticated using (true);

-- =====================================================================
-- 5. DOCUMENTS — add the new entity FKs introduced in this migration
-- =====================================================================

alter table public.documents
  add column if not exists press_release_id uuid
    references public.press_releases(press_release_id) on delete set null,
  add column if not exists coverage_id uuid
    references public.media_coverage(coverage_id) on delete set null,
  add column if not exists pr_value_report_id uuid
    references public.pr_value_reports(report_id) on delete set null;

create index if not exists documents_press_release_idx on public.documents(press_release_id);
create index if not exists documents_coverage_idx on public.documents(coverage_id);
create index if not exists documents_pr_value_report_idx on public.documents(pr_value_report_id);
