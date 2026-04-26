-- Aegis 0008: super-admin role, extended profile fields, username login
-- Adds:
--   1. profile fields: username (unique), gmail_address, contact_number, role
--   2. RPC `get_email_by_username` so the login form can resolve a username
--      back to the email Supabase Auth wants.
-- The existing handle_new_user / handle_user_update triggers from 0007 only
-- touch display_name + avatar_url. Username / gmail / contact / role are
-- managed directly in `profiles` by the super-admin actions.

-- =====================================================================
-- 1. Extend profiles
-- =====================================================================

alter table public.profiles
  add column if not exists username varchar(64),
  add column if not exists gmail_address varchar(255),
  add column if not exists contact_number varchar(50),
  add column if not exists role varchar(32) not null default 'member'
    check (role in ('member', 'super_admin'));

-- Username must be unique when set; nulls allowed so existing users keep
-- working until an admin gives them one.
create unique index if not exists profiles_username_unique
  on public.profiles(lower(username))
  where username is not null;

create index if not exists profiles_role_idx on public.profiles(role);

-- =====================================================================
-- 2. Username → email RPC for login
-- =====================================================================

create or replace function public.get_email_by_username(p_username text)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select email from public.profiles where lower(username) = lower(p_username) limit 1;
$$;

grant execute on function public.get_email_by_username(text) to anon, authenticated;

-- =====================================================================
-- BOOTSTRAP (run manually, once)
-- =====================================================================
-- After applying the migration, promote your own account:
--
--   update public.profiles
--   set role = 'super_admin'
--   where email = 'editor.works@outlook.com';
--
-- From then on, the User Management page lets the super admin add /
-- edit / remove staff without touching Supabase directly.
