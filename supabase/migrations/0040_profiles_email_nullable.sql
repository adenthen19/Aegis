-- Aegis 0040: allow null email on profiles so anon kiosk users don't
-- crash the handle_new_user trigger.
--
-- Background: the kiosk lets anyone sign in anonymously via Supabase
-- (no login screen). When Supabase creates an anon row in auth.users,
-- `email` is NULL — anonymous users don't have one. The
-- `handle_new_user` trigger from migration 0007 then copies the row
-- into public.profiles which had `email varchar(255) not null`,
-- raising a NOT NULL violation that rolls back the auth.users insert.
-- Visible symptom on the kiosk: "Database error creating anonymous
-- user" even with anonymous sign-ins enabled in the project.
--
-- Fix: make profiles.email nullable. The handle_new_user trigger
-- continues to copy the (possibly-null) email; downstream code
-- (types.ts Profile.email, the few places that read profile.email)
-- has been updated to treat email as string | null.

alter table public.profiles
  alter column email drop not null;

comment on column public.profiles.email is
  'Mirror of auth.users.email. NULL for anonymous kiosk operators (no email at sign-in).';
