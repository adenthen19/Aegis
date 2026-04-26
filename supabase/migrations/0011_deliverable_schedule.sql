-- Aegis 0011: deliverable schedule
-- For each commitment we plan zero or more sessions ("schedule rows"). Example:
-- the recurring deliverable "3 analyst briefings" gets 3 schedule rows, each
-- with date/time, location, attendee list (linked analysts + ad-hoc names),
-- status. When a session is marked completed, the parent commitment's
-- completed_count bumps so the on-track view stays accurate.

-- =====================================================================
-- 1. ENUM
-- =====================================================================

do $$ begin
  create type schedule_status as enum ('planned', 'confirmed', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. SCHEDULE ROWS
-- =====================================================================

create table if not exists public.deliverable_schedule (
  schedule_id uuid primary key default gen_random_uuid(),
  client_deliverable_id uuid not null
    references public.client_deliverables(client_deliverable_id) on delete cascade,
  -- Once minutes are logged, we link the schedule row to the meeting record.
  -- The link is informational; deleting the meeting nulls the FK rather than
  -- cascading the schedule away.
  meeting_id uuid references public.meetings(meeting_id) on delete set null,
  scheduled_at timestamptz not null,
  location varchar(255),
  status schedule_status not null default 'planned',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists deliverable_schedule_parent_idx
  on public.deliverable_schedule(client_deliverable_id);
create index if not exists deliverable_schedule_status_idx
  on public.deliverable_schedule(status);
create index if not exists deliverable_schedule_meeting_idx
  on public.deliverable_schedule(meeting_id);

-- =====================================================================
-- 3. ATTENDEES — single table, discriminated row kind
-- =====================================================================
-- A row is either:
--   • a linked analyst: investor_id is set, name/affiliation are null
--   • an ad-hoc attendee: name is set (affiliation optional), investor_id is null
-- Ad-hoc rows are the typical "new representative who showed up" case — added
-- before or after the session.

create table if not exists public.deliverable_schedule_attendees (
  attendee_id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null
    references public.deliverable_schedule(schedule_id) on delete cascade,
  investor_id uuid references public.analysts(investor_id) on delete cascade,
  name text,
  affiliation text,
  note text,
  created_at timestamptz not null default now(),
  constraint deliverable_schedule_attendee_kind_check
    check ((investor_id is not null and name is null and affiliation is null)
        or (investor_id is null and name is not null))
);

create index if not exists deliverable_schedule_attendees_schedule_idx
  on public.deliverable_schedule_attendees(schedule_id);
create index if not exists deliverable_schedule_attendees_investor_idx
  on public.deliverable_schedule_attendees(investor_id);

-- Same analyst can't be added twice to the same session.
create unique index if not exists deliverable_schedule_attendees_unique_analyst
  on public.deliverable_schedule_attendees(schedule_id, investor_id)
  where investor_id is not null;
