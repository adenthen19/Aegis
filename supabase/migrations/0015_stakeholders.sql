-- Aegis 0015: client stakeholders
--
-- Stakeholders are the IR firm's core asset — the named humans they engage
-- with on the client side (CEO, CFO, IR director, board members, advisors,
-- audit firm partner, etc.). Up to now the system stored CEO and CFO as
-- scalar columns on `clients` and the rest as a free-text JSON array
-- (`clients.advisory_syndicate`). That's fine for display but not queryable
-- and can't carry contact info or a "primary contact" flag.
--
-- This migration:
--   1. Creates client_stakeholders.
--   2. Backfills existing data (ceo_name, cfo_name, advisory_syndicate).
--   3. Leaves the legacy columns in place — they're not authoritative anymore
--      but removing them would break anything still reading them. A future
--      cleanup migration can drop them once the UI fully reads from the new
--      table.

-- =====================================================================
-- 1. ENUM
-- =====================================================================

do $$ begin
  -- executive : C-suite or senior management on the client side
  -- board     : board members / non-executive directors
  -- advisor   : external advisors (auditor, lawyer, principal advisor, etc.)
  -- other     : company secretary, IR/PR contacts who don't fit above
  create type stakeholder_category as enum ('executive', 'board', 'advisor', 'other');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. TABLE
-- =====================================================================

create table if not exists public.client_stakeholders (
  stakeholder_id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(client_id) on delete cascade,
  category stakeholder_category not null default 'executive',
  role varchar(255) not null,
  full_name varchar(255) not null,
  email varchar(255),
  phone varchar(64),
  is_primary boolean not null default false,
  notes text,
  -- Audit columns (auto-filled by triggers from migration 0013 — wire them up
  -- explicitly below since they only fired on tables that existed at that
  -- migration's runtime).
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_stakeholders_client_idx
  on public.client_stakeholders(client_id);
create index if not exists client_stakeholders_category_idx
  on public.client_stakeholders(client_id, category);

-- One primary stakeholder per client (others can be flagged but only one is
-- "the" main contact for IR comms).
create unique index if not exists client_stakeholders_one_primary_per_client
  on public.client_stakeholders(client_id)
  where is_primary;

-- updated_at + audit triggers
drop trigger if exists client_stakeholders_set_updated_at on public.client_stakeholders;
create trigger client_stakeholders_set_updated_at before update on public.client_stakeholders
  for each row execute function public.set_updated_at();

drop trigger if exists client_stakeholders_set_audit_insert on public.client_stakeholders;
create trigger client_stakeholders_set_audit_insert before insert on public.client_stakeholders
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists client_stakeholders_set_audit_update on public.client_stakeholders;
create trigger client_stakeholders_set_audit_update before update on public.client_stakeholders
  for each row execute function public.set_audit_user_on_update();

-- RLS
alter table public.client_stakeholders enable row level security;

drop policy if exists "auth read client_stakeholders" on public.client_stakeholders;
create policy "auth read client_stakeholders" on public.client_stakeholders
  for select to authenticated using (true);

drop policy if exists "auth insert client_stakeholders" on public.client_stakeholders;
create policy "auth insert client_stakeholders" on public.client_stakeholders
  for insert to authenticated with check (true);

drop policy if exists "auth update client_stakeholders" on public.client_stakeholders;
create policy "auth update client_stakeholders" on public.client_stakeholders
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete client_stakeholders" on public.client_stakeholders;
create policy "auth delete client_stakeholders" on public.client_stakeholders
  for delete to authenticated using (true);

-- =====================================================================
-- 3. BACKFILL FROM LEGACY COLUMNS
-- =====================================================================
-- Only runs once: skips clients that already have any stakeholder rows so
-- re-running the migration on a populated DB doesn't create duplicates.

do $$
declare
  c record;
begin
  for c in
    select client_id, ceo_name, cfo_name, advisory_syndicate
    from public.clients
    where not exists (
      select 1 from public.client_stakeholders s where s.client_id = clients.client_id
    )
  loop
    if c.ceo_name is not null and trim(c.ceo_name) <> '' then
      insert into public.client_stakeholders (client_id, category, role, full_name, is_primary)
      values (c.client_id, 'executive', 'CEO', trim(c.ceo_name), true);
    end if;

    if c.cfo_name is not null and trim(c.cfo_name) <> '' then
      insert into public.client_stakeholders (client_id, category, role, full_name)
      values (c.client_id, 'executive', 'CFO', trim(c.cfo_name));
    end if;

    -- advisory_syndicate is jsonb; we expect an array of strings (firm names)
    -- but tolerate junk by guarding with jsonb_typeof.
    if c.advisory_syndicate is not null
       and jsonb_typeof(c.advisory_syndicate) = 'array' then
      insert into public.client_stakeholders (client_id, category, role, full_name)
      select
        c.client_id,
        'advisor',
        'Advisor',
        trim(value)
      from jsonb_array_elements_text(c.advisory_syndicate) as t(value)
      where trim(value) <> '';
    end if;
  end loop;
end $$;
