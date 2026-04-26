-- Aegis 0010: client deliverable commitments
-- Standard deliverables we commit to per service tier (analyst meetings, press
-- releases, Q&A packs, etc) are defined as templates by super admins. When a
-- client engages with a given service_tier, we seed a per-client checklist row
-- so nothing falls through the cracks during the engagement.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  -- one_off       : delivered once per engagement (e.g. roadmap document)
  -- recurring     : delivered N times across the engagement (e.g. 4 analyst meetings)
  -- event_triggered: prompted when something else happens (e.g. Q&A pack when a briefing is logged)
  -- ongoing       : runs throughout the engagement (e.g. strategic consultancy)
  create type deliverable_kind as enum ('one_off', 'recurring', 'event_triggered', 'ongoing');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type deliverable_status as enum ('pending', 'in_progress', 'completed', 'not_applicable');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. TEMPLATES — admin-defined per service tier
-- =====================================================================

create table if not exists public.deliverable_templates (
  template_id uuid primary key default gen_random_uuid(),
  service_tier service_tier not null,
  kind deliverable_kind not null,
  label text not null,
  default_target_count integer,
  display_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- only recurring deliverables have a target count
  constraint deliverable_templates_target_kind_check
    check ((kind = 'recurring' and default_target_count is not null and default_target_count > 0)
        or (kind <> 'recurring' and default_target_count is null))
);

create index if not exists deliverable_templates_tier_idx
  on public.deliverable_templates(service_tier)
  where is_active;

-- =====================================================================
-- 3. CLIENT DELIVERABLES — seeded from templates per engagement
-- =====================================================================
-- We snapshot label + kind + target_count from the template at seed time so
-- editing a template doesn't retro-rewrite history of past engagements. The
-- template_id link is preserved so we can show "from template X" or skip
-- re-seeding if the row already exists.

create table if not exists public.client_deliverables (
  client_deliverable_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  template_id uuid references public.deliverable_templates(template_id) on delete set null,
  service_tier service_tier not null,
  kind deliverable_kind not null,
  label text not null,
  status deliverable_status not null default 'pending',
  target_count integer,
  completed_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_deliverables_count_kind_check
    check ((kind = 'recurring' and target_count is not null)
        or (kind <> 'recurring' and target_count is null)),
  constraint client_deliverables_completed_nonneg
    check (completed_count >= 0)
);

-- Prevent double-seeding the same template into the same client.
create unique index if not exists client_deliverables_unique_per_client_template
  on public.client_deliverables(client_id, template_id)
  where template_id is not null;

create index if not exists client_deliverables_client_idx
  on public.client_deliverables(client_id);
create index if not exists client_deliverables_status_idx
  on public.client_deliverables(status);

-- =====================================================================
-- 4. SEED DEFAULT TEMPLATES
-- =====================================================================
-- Six standard deliverables for IR/PR engagements. Defaults can be edited or
-- disabled via the admin UI. Inserted only if the table is empty so re-running
-- the migration on a populated database doesn't duplicate.

insert into public.deliverable_templates
  (service_tier, kind, label, default_target_count, display_order)
select tier, kind, label, target, ord
from (values
  ('ir'::service_tier, 'ongoing'::deliverable_kind,
    'Strategic IR consultancy throughout the engagement period',
    null::integer, 10),
  ('ir'::service_tier, 'one_off'::deliverable_kind,
    'Plan an integrated IR programme roadmap and communications calendar',
    null::integer, 20),
  ('ir'::service_tier, 'recurring'::deliverable_kind,
    'Organise one-to-one analyst / influencer / financial blogger meetings or webinars',
    4::integer, 30),
  ('ir'::service_tier, 'recurring'::deliverable_kind,
    'Draft and disseminate press releases (results & corporate exercises)',
    4::integer, 40),
  ('ir'::service_tier, 'event_triggered'::deliverable_kind,
    'Prepare Q&A pack for analyst / media meetings',
    null::integer, 50),

  ('pr'::service_tier, 'ongoing'::deliverable_kind,
    'Strategic PR consultancy throughout the engagement period',
    null::integer, 10),
  ('pr'::service_tier, 'one_off'::deliverable_kind,
    'Plan an integrated PR programme roadmap and communications calendar',
    null::integer, 20),
  ('pr'::service_tier, 'recurring'::deliverable_kind,
    'One-to-one media interviews with relevant newspapers / magazines / broadcast media',
    4::integer, 30),
  ('pr'::service_tier, 'recurring'::deliverable_kind,
    'Draft and disseminate press releases (results & corporate exercises)',
    4::integer, 40),
  ('pr'::service_tier, 'event_triggered'::deliverable_kind,
    'Prepare Q&A pack for media interviews',
    null::integer, 50)
) as defaults(tier, kind, label, target, ord)
where not exists (select 1 from public.deliverable_templates);
