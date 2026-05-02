-- Aegis 0030: Google OAuth connections + per-event Google Sheet binding.
--
-- We let staff connect their Google account so Aegis can push attendance to
-- a Google Sheet "as them" — meaning the client can simply share the sheet
-- with the staff member's Gmail (rather than a service-account robot email),
-- and the sheet's revision history shows the real human's name.
--
-- One row per Aegis user. Tokens are stored in plaintext under RLS that
-- restricts each row to its owner; this is acceptable for an internal tool
-- of this size, but if the deployment ever grows we'd swap in pgsodium /
-- Supabase Vault encryption.

-- =====================================================================
-- 1. CONNECTIONS TABLE
-- =====================================================================

create table if not exists public.google_connections (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  google_email varchar(255) not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scope text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists google_connections_set_updated_at on public.google_connections;
create trigger google_connections_set_updated_at before update on public.google_connections
  for each row execute function public.set_updated_at();

alter table public.google_connections enable row level security;

-- Each user can only read / write / delete their own connection. Service
-- role (used by server-side actions running as the user) bypasses RLS, so
-- a server action authenticated as user X can still load X's tokens.
drop policy if exists "self read google_connections" on public.google_connections;
create policy "self read google_connections" on public.google_connections
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "self upsert google_connections" on public.google_connections;
create policy "self upsert google_connections" on public.google_connections
  for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "self update google_connections" on public.google_connections;
create policy "self update google_connections" on public.google_connections
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "self delete google_connections" on public.google_connections;
create policy "self delete google_connections" on public.google_connections
  for delete to authenticated
  using (user_id = auth.uid());

-- =====================================================================
-- 2. EVENT → SHEET BINDING
-- =====================================================================
-- Remember the last sheet a given event was pushed to so the next push
-- pre-fills the URL (most events get pushed to the same sheet repeatedly
-- as attendance trickles in). Stored as the bare sheet ID; we strip the
-- /spreadsheets/d/<id>/... wrapper at write time so users can paste the
-- full URL or just the ID.

alter table public.events
  add column if not exists google_sheet_id varchar(128);

alter table public.events
  add column if not exists google_sheet_last_pushed_at timestamptz;
