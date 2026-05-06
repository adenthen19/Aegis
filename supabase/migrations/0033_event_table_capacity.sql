-- Aegis 0033: per-event table capacity + audit actions for the
-- check-in floor reality.
--
-- Today the kiosk treats `event_guests.table_number` as free text with no
-- notion of capacity. Real events have a per-event seating rule (e.g. "10
-- per round table") plus per-table exceptions (head table seats 12, the
-- VIP square seats 6). At the door we routinely need to:
--   • re-seat a whole table at the last minute,
--   • slot in a +1 companion when the host's table is full,
--   • register a brand-new walk-in with no prior record.
--
-- All three need to *warn* about capacity, never *block* it — the guest is
-- physically standing there. So we model capacity as a soft target the
-- usher can override, with the override audited.
--
-- Two-level model:
--   1. events.default_table_capacity — the standard table size for the
--      event (NULL means "we don't track capacity here", same as today).
--   2. event_tables — sparse override registry. We only store rows for
--      tables that need a non-default capacity OR a label OR that the
--      host wants to pre-register before any guest is seated. Tables
--      derived from event_guests.table_number with no row here just use
--      events.default_table_capacity.
--
-- We do NOT FK event_guests.table_number to event_tables — that would
-- break CSV imports where the host hasn't pre-registered every table.

-- =====================================================================
-- 1. DEFAULT CAPACITY ON EVENTS
-- =====================================================================

alter table public.events
  add column if not exists default_table_capacity smallint
    check (default_table_capacity is null or default_table_capacity > 0);

comment on column public.events.default_table_capacity is
  'Standard pax-per-table for this event. NULL disables capacity warnings entirely. Per-table overrides live in event_tables.';

-- =====================================================================
-- 2. EVENT_TABLES (sparse override + pre-registration registry)
-- =====================================================================

create table if not exists public.event_tables (
  event_id uuid not null references public.events(event_id) on delete cascade,
  table_number varchar(32) not null,
  capacity smallint not null check (capacity > 0),
  label varchar(255),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, table_number)
);

create index if not exists event_tables_event_idx
  on public.event_tables(event_id);

drop trigger if exists event_tables_set_updated_at on public.event_tables;
create trigger event_tables_set_updated_at before update on public.event_tables
  for each row execute function public.set_updated_at();

alter table public.event_tables enable row level security;

drop policy if exists "auth read event_tables" on public.event_tables;
create policy "auth read event_tables" on public.event_tables
  for select to authenticated using (true);

drop policy if exists "auth insert event_tables" on public.event_tables;
create policy "auth insert event_tables" on public.event_tables
  for insert to authenticated with check (true);

drop policy if exists "auth update event_tables" on public.event_tables;
create policy "auth update event_tables" on public.event_tables
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete event_tables" on public.event_tables;
create policy "auth delete event_tables" on public.event_tables
  for delete to authenticated using (true);

-- Capacity edits should propagate to open kiosks so the picker shows
-- fresh numbers without a manual refresh. Mirrors the realtime
-- registration done for event_guests in 0028.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'event_tables'
  ) then
    alter publication supabase_realtime add table public.event_tables;
  end if;
end $$;

-- =====================================================================
-- 3. NEW AUDIT ACTIONS
-- =====================================================================
-- Each new floor flow gets its own action so the post-event activity
-- feed reads naturally:
--   • walkin_add      — guest with no prior record was registered + checked in
--   • companion_add   — +1 sibling row inserted off an existing guest
--   • table_swap      — table_number changed (one audit row per affected guest)
--   • capacity_override — usher proceeded past a full-table warning
--
-- ALTER TYPE ADD VALUE is non-transactional, so each value gets its own
-- guarded do-block — same pattern as 0031.

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'walkin_add'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'walkin_add';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'companion_add'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'companion_add';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'table_swap'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'table_swap';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'capacity_override'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'capacity_override';
  end if;
end $$;
