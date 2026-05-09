-- Aegis 0036: free-form floor-plan layout per event.
--
-- Up to 0035 the seating UI grouped tables by section in an auto-arranged
-- grid. That works for prospectus launches that follow a standard room
-- shape, but real venues vary: a horseshoe of round tables with a stage
-- at one end, a press pen along one wall, registration desks near the
-- entrance, pillars in the middle of a ballroom. The host wants to set
-- up the layout to match the actual room and have the kiosk + admin view
-- reflect it.
--
-- Two pieces:
--   1. Per-table x/y on event_tables (existing override registry). When
--      a position is set we render the table at those coordinates;
--      otherwise we fall back to the auto-arranged section grid.
--   2. New event_room_markers table for non-table elements — stage,
--      doors, podium, registration desk, custom labels. These don't
--      seat anyone; they're purely visual aids on the canvas.
--
-- Coordinate system: 0..1200 horizontal, 0..800 vertical (internal
-- units). The UI scales to fit the viewport, so 1200x800 is just the
-- shared coordinate space the DB stores. Smallint is plenty for that
-- range and keeps the table tight.

-- =====================================================================
-- 1. POSITIONS ON event_tables
-- =====================================================================

alter table public.event_tables
  add column if not exists x smallint
    check (x is null or (x >= 0 and x <= 2000)),
  add column if not exists y smallint
    check (y is null or (y >= 0 and y <= 2000));

comment on column public.event_tables.x is
  'X coordinate on the floor-plan canvas (0..1200 native, range allows zoom). NULL = auto-position by section.';
comment on column public.event_tables.y is
  'Y coordinate on the floor-plan canvas (0..800 native). NULL = auto-position by section.';

-- =====================================================================
-- 2. ROOM MARKERS — non-table visual elements
-- =====================================================================

do $$ begin
  -- Marker kinds the floor-plan canvas knows how to render. 'custom'
  -- is the catch-all for anything the host wants to label themselves
  -- (e.g. "Pillar", "Buffet", "Coat check").
  create type room_marker_kind as enum (
    'stage',
    'door',
    'entrance',
    'podium',
    'registration',
    'custom'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.event_room_markers (
  marker_id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(event_id) on delete cascade,
  kind room_marker_kind not null,
  -- Free text label. Stage/door/podium have sensible defaults applied at
  -- the UI layer when this is null; 'custom' requires it.
  label varchar(255),
  -- Position + footprint on the canvas.
  x smallint not null check (x >= 0 and x <= 2000),
  y smallint not null check (y >= 0 and y <= 2000),
  w smallint not null default 80 check (w > 0 and w <= 2000),
  h smallint not null default 40 check (h > 0 and h <= 2000),
  -- Degrees clockwise from horizontal. 0..359; we store a smallint so
  -- arithmetic stays cheap. UI doesn't expose rotation in v1 but the
  -- column is here so we don't need a follow-up migration.
  rotation smallint not null default 0
    check (rotation >= 0 and rotation < 360),
  created_by_user_id uuid references public.profiles(user_id) on delete set null,
  updated_by_user_id uuid references public.profiles(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_room_markers_event_idx
  on public.event_room_markers(event_id);

drop trigger if exists event_room_markers_set_updated_at on public.event_room_markers;
create trigger event_room_markers_set_updated_at before update on public.event_room_markers
  for each row execute function public.set_updated_at();

drop trigger if exists event_room_markers_set_audit_insert on public.event_room_markers;
create trigger event_room_markers_set_audit_insert before insert on public.event_room_markers
  for each row execute function public.set_audit_user_on_insert();

drop trigger if exists event_room_markers_set_audit_update on public.event_room_markers;
create trigger event_room_markers_set_audit_update before update on public.event_room_markers
  for each row execute function public.set_audit_user_on_update();

alter table public.event_room_markers enable row level security;

drop policy if exists "auth read event_room_markers" on public.event_room_markers;
create policy "auth read event_room_markers" on public.event_room_markers
  for select to authenticated using (true);

drop policy if exists "auth insert event_room_markers" on public.event_room_markers;
create policy "auth insert event_room_markers" on public.event_room_markers
  for insert to authenticated with check (true);

drop policy if exists "auth update event_room_markers" on public.event_room_markers;
create policy "auth update event_room_markers" on public.event_room_markers
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete event_room_markers" on public.event_room_markers;
create policy "auth delete event_room_markers" on public.event_room_markers
  for delete to authenticated using (true);

-- Layout edits should propagate to open kiosks if we ever add a
-- realtime canvas. Mirrors the realtime registration done for
-- event_tables in 0033.
do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'event_room_markers'
  ) then
    alter publication supabase_realtime add table public.event_room_markers;
  end if;
end $$;
