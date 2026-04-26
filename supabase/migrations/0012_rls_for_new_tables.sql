-- Aegis 0012: enable RLS on tables added since 0001
--
-- Original 5 tables (clients, analysts, media_contacts, projects, meetings) had
-- RLS enabled in 0001. Tables added in 0007 / 0010 / 0011 did not. Without RLS,
-- the anon Supabase key would let an attacker bypass the server actions and
-- read or mutate these tables directly. This migration closes that gap.
--
-- Policy model (matches 0001):
--   • All read/write open to any authenticated user (this app is internal-only
--     and there is no per-row tenant isolation).
--   • Exception: deliverable_templates write is gated to super_admin role only,
--     mirroring the application-layer guard in admin actions.

-- ---------------------------------------------------------------------------
-- Helper: super-admin check (security definer so anon JWT can't spoof it)
-- ---------------------------------------------------------------------------

create or replace function public.is_super_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role = 'super_admin' from public.profiles where user_id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_super_admin() from public;
grant execute on function public.is_super_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
-- Profiles mirror auth.users; reads are open (we render team pickers across
-- the app). Inserts come from the on-auth-user-created trigger (security
-- definer); regular users may update their own row; super-admins may update
-- anyone's row (used by the user management page via the admin client).

alter table public.profiles enable row level security;

drop policy if exists "auth read profiles" on public.profiles;
create policy "auth read profiles" on public.profiles
  for select to authenticated using (true);

drop policy if exists "self update profile" on public.profiles;
create policy "self update profile" on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "super admin update any profile" on public.profiles;
create policy "super admin update any profile" on public.profiles
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- meeting_attendees
-- ---------------------------------------------------------------------------

alter table public.meeting_attendees enable row level security;

drop policy if exists "auth read meeting_attendees" on public.meeting_attendees;
create policy "auth read meeting_attendees" on public.meeting_attendees
  for select to authenticated using (true);

drop policy if exists "auth insert meeting_attendees" on public.meeting_attendees;
create policy "auth insert meeting_attendees" on public.meeting_attendees
  for insert to authenticated with check (true);

drop policy if exists "auth update meeting_attendees" on public.meeting_attendees;
create policy "auth update meeting_attendees" on public.meeting_attendees
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete meeting_attendees" on public.meeting_attendees;
create policy "auth delete meeting_attendees" on public.meeting_attendees
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- action_items
-- ---------------------------------------------------------------------------

alter table public.action_items enable row level security;

drop policy if exists "auth read action_items" on public.action_items;
create policy "auth read action_items" on public.action_items
  for select to authenticated using (true);

drop policy if exists "auth insert action_items" on public.action_items;
create policy "auth insert action_items" on public.action_items
  for insert to authenticated with check (true);

drop policy if exists "auth update action_items" on public.action_items;
create policy "auth update action_items" on public.action_items
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete action_items" on public.action_items;
create policy "auth delete action_items" on public.action_items
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- deliverable_templates  (admin write, all-read)
-- ---------------------------------------------------------------------------

alter table public.deliverable_templates enable row level security;

drop policy if exists "auth read deliverable_templates" on public.deliverable_templates;
create policy "auth read deliverable_templates" on public.deliverable_templates
  for select to authenticated using (true);

drop policy if exists "super admin insert deliverable_templates" on public.deliverable_templates;
create policy "super admin insert deliverable_templates" on public.deliverable_templates
  for insert to authenticated
  with check (public.is_super_admin());

drop policy if exists "super admin update deliverable_templates" on public.deliverable_templates;
create policy "super admin update deliverable_templates" on public.deliverable_templates
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

drop policy if exists "super admin delete deliverable_templates" on public.deliverable_templates;
create policy "super admin delete deliverable_templates" on public.deliverable_templates
  for delete to authenticated
  using (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- client_deliverables
-- ---------------------------------------------------------------------------

alter table public.client_deliverables enable row level security;

drop policy if exists "auth read client_deliverables" on public.client_deliverables;
create policy "auth read client_deliverables" on public.client_deliverables
  for select to authenticated using (true);

drop policy if exists "auth insert client_deliverables" on public.client_deliverables;
create policy "auth insert client_deliverables" on public.client_deliverables
  for insert to authenticated with check (true);

drop policy if exists "auth update client_deliverables" on public.client_deliverables;
create policy "auth update client_deliverables" on public.client_deliverables
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete client_deliverables" on public.client_deliverables;
create policy "auth delete client_deliverables" on public.client_deliverables
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- deliverable_schedule
-- ---------------------------------------------------------------------------

alter table public.deliverable_schedule enable row level security;

drop policy if exists "auth read deliverable_schedule" on public.deliverable_schedule;
create policy "auth read deliverable_schedule" on public.deliverable_schedule
  for select to authenticated using (true);

drop policy if exists "auth insert deliverable_schedule" on public.deliverable_schedule;
create policy "auth insert deliverable_schedule" on public.deliverable_schedule
  for insert to authenticated with check (true);

drop policy if exists "auth update deliverable_schedule" on public.deliverable_schedule;
create policy "auth update deliverable_schedule" on public.deliverable_schedule
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete deliverable_schedule" on public.deliverable_schedule;
create policy "auth delete deliverable_schedule" on public.deliverable_schedule
  for delete to authenticated using (true);

-- ---------------------------------------------------------------------------
-- deliverable_schedule_attendees
-- ---------------------------------------------------------------------------

alter table public.deliverable_schedule_attendees enable row level security;

drop policy if exists "auth read deliverable_schedule_attendees" on public.deliverable_schedule_attendees;
create policy "auth read deliverable_schedule_attendees" on public.deliverable_schedule_attendees
  for select to authenticated using (true);

drop policy if exists "auth insert deliverable_schedule_attendees" on public.deliverable_schedule_attendees;
create policy "auth insert deliverable_schedule_attendees" on public.deliverable_schedule_attendees
  for insert to authenticated with check (true);

drop policy if exists "auth update deliverable_schedule_attendees" on public.deliverable_schedule_attendees;
create policy "auth update deliverable_schedule_attendees" on public.deliverable_schedule_attendees
  for update to authenticated using (true) with check (true);

drop policy if exists "auth delete deliverable_schedule_attendees" on public.deliverable_schedule_attendees;
create policy "auth delete deliverable_schedule_attendees" on public.deliverable_schedule_attendees
  for delete to authenticated using (true);
