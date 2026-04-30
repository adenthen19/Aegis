-- Aegis 0025: event management
--
-- Stand-alone event tracking for AGMs, briefings, launches, etc. Each event
-- targets either an existing client (FK) or an ad-hoc / prospect engagement
-- recorded only as a free-text label (`adhoc_client_name`). One of the two
-- must be set; never both.
--
-- Each event has a guest list (event_guests) with full contact info, a
-- `checked_in` flag for on-the-day attendance, and a `checked_in_at`
-- timestamp captured automatically when the flag flips true.
--
-- This is intentionally separate from `deliverable_schedule`, which is
-- tightly coupled to engagements + client_deliverables. Events here can
-- exist without an engagement (ad-hoc) and carry richer guest contact
-- columns than the schedule attendees table.

-- =====================================================================
-- 1. ENUM
-- =====================================================================

do $$ begin
  create type event_status as enum ('planned', 'ongoing', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. EVENTS
-- =====================================================================

create table if not exists public.events (
  event_id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(client_id) on delete set null,
  adhoc_client_name varchar(255),
  name varchar(255) not null,
  event_date timestamptz not null,
  location varchar(255),
  description text,
  status event_status not null default 'planned',
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_client_xor_adhoc_check
    check ((client_id is not null and adhoc_client_name is null)
        or (client_id is null and adhoc_client_name is not null))
);

create index if not exists events_client_idx on public.events(client_id);
create index if not exists events_status_idx on public.events(status);
create index if not exists events_date_idx on public.events(event_date);
create index if not exists events_created_by_idx on public.events(created_by_user_id);

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at before update on public.events
  for each row execute function public.set_updated_at();

drop trigger if exists events_set_audit_insert on public.events;
create trigger events_set_audit_insert before insert on public.events
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists events_set_audit_update on public.events;
create trigger events_set_audit_update before update on public.events
  for each row execute function public.set_audit_user_on_update();

alter table public.events enable row level security;

drop policy if exists "auth read events" on public.events;
create policy "auth read events" on public.events
  for select to authenticated using (true);

drop policy if exists "auth insert events" on public.events;
create policy "auth insert events" on public.events
  for insert to authenticated with check (true);

drop policy if exists "auth update events" on public.events;
create policy "auth update events" on public.events
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete events" on public.events;
create policy "auth delete events" on public.events
  for delete to authenticated using (true);

-- =====================================================================
-- 3. GUESTS
-- =====================================================================

create table if not exists public.event_guests (
  guest_id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(event_id) on delete cascade,
  full_name varchar(255) not null,
  title varchar(255),
  company varchar(255),
  contact_number varchar(64),
  email varchar(255),
  checked_in boolean not null default false,
  checked_in_at timestamptz,
  notes text,
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_guests_event_idx on public.event_guests(event_id);
create index if not exists event_guests_checked_in_idx on public.event_guests(event_id, checked_in);
create index if not exists event_guests_email_idx on public.event_guests(event_id, lower(email));

drop trigger if exists event_guests_set_updated_at on public.event_guests;
create trigger event_guests_set_updated_at before update on public.event_guests
  for each row execute function public.set_updated_at();

drop trigger if exists event_guests_set_audit_insert on public.event_guests;
create trigger event_guests_set_audit_insert before insert on public.event_guests
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists event_guests_set_audit_update on public.event_guests;
create trigger event_guests_set_audit_update before update on public.event_guests
  for each row execute function public.set_audit_user_on_update();

-- Auto-stamp checked_in_at when checked_in flips true; clear it when flipped
-- false. Lets the UI just toggle a checkbox without thinking about the
-- timestamp side. Run as a BEFORE trigger so the row write captures the
-- adjusted value in a single update.
create or replace function public.event_guest_sync_checked_in_at()
returns trigger
language plpgsql
as $$
begin
  if (tg_op = 'INSERT') then
    if new.checked_in then
      new.checked_in_at := coalesce(new.checked_in_at, now());
    else
      new.checked_in_at := null;
    end if;
    return new;
  end if;

  -- UPDATE
  if new.checked_in is distinct from old.checked_in then
    if new.checked_in then
      new.checked_in_at := coalesce(new.checked_in_at, now());
    else
      new.checked_in_at := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists event_guests_sync_checked_in_at on public.event_guests;
create trigger event_guests_sync_checked_in_at
  before insert or update on public.event_guests
  for each row execute function public.event_guest_sync_checked_in_at();

alter table public.event_guests enable row level security;

drop policy if exists "auth read event_guests" on public.event_guests;
create policy "auth read event_guests" on public.event_guests
  for select to authenticated using (true);

drop policy if exists "auth insert event_guests" on public.event_guests;
create policy "auth insert event_guests" on public.event_guests
  for insert to authenticated with check (true);

drop policy if exists "auth update event_guests" on public.event_guests;
create policy "auth update event_guests" on public.event_guests
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete event_guests" on public.event_guests;
create policy "auth delete event_guests" on public.event_guests
  for delete to authenticated using (true);
