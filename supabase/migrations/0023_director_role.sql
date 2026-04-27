-- Aegis 0023: add director role
--
-- Roles now form a tiered model:
--   member       — day-to-day account managers, IR/PR executives
--   director     — exec director / account director; firm-wide read access
--                  to the director dashboard. Cannot manage users or edit
--                  templates (still super_admin only).
--   super_admin  — system administration (users, deliverable templates).
--
-- The role column is a plain varchar with a check constraint (kept that way
-- since 0008 to avoid the pain of altering an enum). Just widen the check.

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('member', 'director', 'super_admin'));

-- Helper used by RLS / app guards. Mirrors is_super_admin from 0012.
create or replace function public.is_director_or_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    (select role in ('director', 'super_admin')
       from public.profiles
      where user_id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_director_or_admin() from public;
grant execute on function public.is_director_or_admin() to authenticated;
