-- Aegis 0007: meeting minutes upgrade
-- Adds:
--   1. profiles table mirroring auth.users (so we can render user pickers and FK
--      action items to a user without going through the admin auth API)
--   2. meeting_type enum + new meeting columns (location, agenda, summary, remarks)
--   3. action_items table (proper rows so "my open to-dos" is a cheap query)
--   4. meeting_attendees junction table (attendees become app users, not free text)
-- Existing meetings rows default to meeting_type = 'briefing' since they
-- currently always link to a client or investor.

-- =====================================================================
-- 1. PROFILES — mirrors auth.users
-- =====================================================================

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email varchar(255) not null,
  display_name varchar(255),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles(email);

-- Sync inserts from auth.users
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'display_name',
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Sync updates from auth.users (display_name / avatar_url change via profile dialog)
create or replace function public.handle_user_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set
    email = new.email,
    display_name = new.raw_user_meta_data->>'display_name',
    avatar_url = new.raw_user_meta_data->>'avatar_url',
    updated_at = now()
  where user_id = new.id;
  return new;
end;
$$;

drop trigger if exists on_auth_user_updated on auth.users;
create trigger on_auth_user_updated
  after update on auth.users
  for each row execute function public.handle_user_update();

-- Backfill existing users
insert into public.profiles (user_id, email, display_name, avatar_url)
select
  id,
  email,
  raw_user_meta_data->>'display_name',
  raw_user_meta_data->>'avatar_url'
from auth.users
on conflict (user_id) do nothing;

-- =====================================================================
-- 2. MEETINGS — type enum + new columns
-- =====================================================================

do $$ begin
  create type meeting_type as enum ('internal', 'briefing');
exception when duplicate_object then null;
end $$;

alter table public.meetings
  add column if not exists meeting_type meeting_type not null default 'briefing',
  add column if not exists location varchar(255),
  add column if not exists agenda_items jsonb not null default '[]'::jsonb,
  add column if not exists summary text,
  add column if not exists other_remarks text;

-- key_takeaways column is left in place so existing rows keep their data,
-- but the new form no longer writes to it.

-- =====================================================================
-- 3. ACTION ITEMS
-- =====================================================================

create table if not exists public.action_items (
  action_item_id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings(meeting_id) on delete cascade,
  item text not null,
  pic_user_id uuid references public.profiles(user_id) on delete set null,
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists action_items_meeting_id_idx on public.action_items(meeting_id);
create index if not exists action_items_pic_user_id_idx on public.action_items(pic_user_id);
create index if not exists action_items_status_idx on public.action_items(status);

-- =====================================================================
-- 4. MEETING ATTENDEES (users invited / present)
-- =====================================================================

create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings(meeting_id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  primary key (meeting_id, user_id)
);

create index if not exists meeting_attendees_user_id_idx on public.meeting_attendees(user_id);
