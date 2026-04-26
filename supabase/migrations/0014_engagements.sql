-- Aegis 0014: engagements
--
-- An "engagement" is a contracted period of work between Aegis and a client.
-- A client typically renews annually, so they may have multiple engagements
-- over time (active + historical). All commitments and scheduled sessions
-- scope to an engagement, not the client directly — that way "are we on track
-- this year" is a clean query, and renewals reset the scoreboard.
--
-- Migration approach:
--   1. Create the engagements table.
--   2. Backfill: for any client that already has client_deliverables (i.e.
--      the system has been used pre-engagements), create one default
--      engagement covering the current year and link existing deliverables
--      and schedule rows to it.
--   3. Make engagement_id NOT NULL on client_deliverables / deliverable_schedule
--      after backfill so future inserts always carry it.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  -- retainer       : ongoing IR/PR retainer (typical 12-month)
  -- ipo            : IPO / pre-IPO project
  -- agm            : AGM/EGM event-bound work
  -- one_off        : single deliverable scope (one report, one campaign)
  -- crisis         : crisis communications
  create type engagement_type as enum ('retainer', 'ipo', 'agm', 'one_off', 'crisis');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type engagement_status as enum ('draft', 'active', 'paused', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. ENGAGEMENTS TABLE
-- =====================================================================

create table if not exists public.engagements (
  engagement_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  name varchar(255) not null,
  engagement_type engagement_type not null default 'retainer',
  status engagement_status not null default 'active',
  -- Period the engagement covers. end_date is nullable for open-ended scopes
  -- but most retainers should fill it (renewal date).
  start_date date not null,
  end_date date,
  -- Service tiers committed under this engagement. Subset of the client's
  -- overall tier list — a client may have an IR retainer + a separate IPO
  -- engagement at the same time.
  service_tier service_tier[] not null default '{}',
  contract_value numeric(12, 2),
  currency varchar(3) not null default 'MYR',
  billing_terms text,
  scope_summary text,
  notes text,
  -- Audit columns (set by trigger from migration 0013)
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint engagements_dates_check
    check (end_date is null or end_date >= start_date)
);

create index if not exists engagements_client_idx on public.engagements(client_id);
create index if not exists engagements_status_idx on public.engagements(status);
create index if not exists engagements_active_idx
  on public.engagements(client_id, status, start_date desc)
  where status = 'active';

-- updated_at + audit triggers
drop trigger if exists engagements_set_updated_at on public.engagements;
create trigger engagements_set_updated_at before update on public.engagements
  for each row execute function public.set_updated_at();

drop trigger if exists engagements_set_audit_insert on public.engagements;
create trigger engagements_set_audit_insert before insert on public.engagements
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists engagements_set_audit_update on public.engagements;
create trigger engagements_set_audit_update before update on public.engagements
  for each row execute function public.set_audit_user_on_update();

-- RLS — same all-authenticated pattern as the rest of the app.
alter table public.engagements enable row level security;

drop policy if exists "auth read engagements" on public.engagements;
create policy "auth read engagements" on public.engagements
  for select to authenticated using (true);

drop policy if exists "auth insert engagements" on public.engagements;
create policy "auth insert engagements" on public.engagements
  for insert to authenticated with check (true);

drop policy if exists "auth update engagements" on public.engagements;
create policy "auth update engagements" on public.engagements
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete engagements" on public.engagements;
create policy "auth delete engagements" on public.engagements
  for delete to authenticated using (true);

-- =====================================================================
-- 3. LINK COLUMNS ON DELIVERABLES + SCHEDULE
-- =====================================================================

alter table public.client_deliverables
  add column if not exists engagement_id uuid
  references public.engagements(engagement_id) on delete cascade;

alter table public.deliverable_schedule
  add column if not exists engagement_id uuid
  references public.engagements(engagement_id) on delete cascade;

create index if not exists client_deliverables_engagement_idx
  on public.client_deliverables(engagement_id);
create index if not exists deliverable_schedule_engagement_idx
  on public.deliverable_schedule(engagement_id);

-- =====================================================================
-- 4. BACKFILL EXISTING DATA
-- =====================================================================
-- For each client that already has commitments, create a default "Initial
-- engagement" running from the earliest commitment's created_at through one
-- year out, and tag every existing commitment + schedule row with it.

do $$
declare
  c record;
  default_engagement_id uuid;
  earliest date;
begin
  for c in
    select distinct cd.client_id, cl.service_tier
    from public.client_deliverables cd
    join public.clients cl on cl.client_id = cd.client_id
    where cd.engagement_id is null
  loop
    select coalesce(min(created_at)::date, current_date)
    into earliest
    from public.client_deliverables
    where client_id = c.client_id;

    insert into public.engagements (
      client_id, name, engagement_type, status,
      start_date, end_date, service_tier, scope_summary
    ) values (
      c.client_id,
      'Initial engagement',
      'retainer',
      'active',
      earliest,
      earliest + interval '1 year',
      c.service_tier,
      'Auto-generated to scope pre-existing commitments. Edit dates and details to match the actual contract.'
    )
    returning engagement_id into default_engagement_id;

    update public.client_deliverables
       set engagement_id = default_engagement_id
     where client_id = c.client_id and engagement_id is null;

    update public.deliverable_schedule s
       set engagement_id = default_engagement_id
      from public.client_deliverables cd
     where s.client_deliverable_id = cd.client_deliverable_id
       and cd.client_id = c.client_id
       and s.engagement_id is null;
  end loop;
end $$;

-- =====================================================================
-- 5. ENFORCE NOT NULL POST-BACKFILL
-- =====================================================================
-- Future inserts MUST carry engagement_id; the seeding code in clients/actions.ts
-- has been updated to attach to the client's currently-active engagement.

alter table public.client_deliverables
  alter column engagement_id set not null;

alter table public.deliverable_schedule
  alter column engagement_id set not null;
