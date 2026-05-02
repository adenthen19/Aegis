-- Aegis 0029: per-action audit log for event guest check-ins.
--
-- Today, `event_guests.checked_in` + `checked_in_at` only show *that* a guest
-- was checked in, not *who* did it or what device they tapped. With multiple
-- ushers running kiosks at the front of house, the firm needs an answerable
-- "who checked Sarah in?" trail — for accountability, training, and the
-- post-event report we hand to the client.
--
-- We log every check-in / undo as a separate row rather than overwriting a
-- column on event_guests. That way:
--   • undo + re-check keeps full history rather than blanking attribution;
--   • we can tell kiosk-driven check-ins apart from admin edits (source col);
--   • the report can show "Last 20 check-ins" with timestamp, person, source.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  -- checkin: guest flipped to checked_in = true
  -- undo:    guest flipped back to checked_in = false
  create type event_checkin_action as enum ('checkin', 'undo');
exception when duplicate_object then null;
end $$;

do $$ begin
  -- kiosk: came from /kiosk/[event_id] front-desk flow
  -- admin: came from the authenticated event detail page (CRUD modal etc.)
  create type event_checkin_source as enum ('kiosk', 'admin');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. TABLE
-- =====================================================================

create table if not exists public.event_guest_checkins (
  checkin_id uuid primary key default gen_random_uuid(),
  guest_id uuid not null references public.event_guests(guest_id) on delete cascade,
  event_id uuid not null references public.events(event_id) on delete cascade,
  action event_checkin_action not null,
  source event_checkin_source not null default 'kiosk',
  performed_by_user_id uuid references public.profiles(user_id) on delete set null,
  performed_at timestamptz not null default now(),
  notes text
);

-- Most queries are "show me the activity feed for THIS event, newest first".
create index if not exists event_guest_checkins_event_time_idx
  on public.event_guest_checkins(event_id, performed_at desc);
create index if not exists event_guest_checkins_guest_idx
  on public.event_guest_checkins(guest_id);
create index if not exists event_guest_checkins_user_idx
  on public.event_guest_checkins(performed_by_user_id);

-- =====================================================================
-- 3. RLS
-- =====================================================================
-- Same shape as the rest of the events module: any authenticated user can
-- read or write. We don't expose this to the public anon key; only signed-in
-- staff hit the kiosk (the page itself redirects to login).

alter table public.event_guest_checkins enable row level security;

drop policy if exists "auth read event_guest_checkins" on public.event_guest_checkins;
create policy "auth read event_guest_checkins" on public.event_guest_checkins
  for select to authenticated using (true);

drop policy if exists "auth insert event_guest_checkins" on public.event_guest_checkins;
create policy "auth insert event_guest_checkins" on public.event_guest_checkins
  for insert to authenticated with check (true);

-- Audit rows are append-only by design — no update / delete policy.

-- =====================================================================
-- 4. REALTIME
-- =====================================================================
-- Audit rows show up in the Recent activity feed of any open kiosk so
-- ushers can see what the team is doing. Mirrors the realtime publication
-- registration done for event_guests in 0028.

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'event_guest_checkins'
  ) then
    alter publication supabase_realtime add table public.event_guest_checkins;
  end if;
end $$;
