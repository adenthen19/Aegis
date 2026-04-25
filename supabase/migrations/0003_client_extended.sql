-- Aegis 0003: extend clients with Bursa Malaysia listing fields
-- + create Storage bucket for client logos.
--
-- IMPORTANT — Postgres requires CREATE TYPE / ALTER TYPE statements OUTSIDE a
-- transaction. Run STEP 1 first, click Run; then STEP 2; then STEP 3.

-- ── STEP 1: enums ─────────────────────────────────────────────────────────
do $$ begin
  create type industry as enum (
    'industrial_products_services',
    'consumer_products_services',
    'construction',
    'energy',
    'financial_services',
    'health_care',
    'plantation',
    'property',
    'reit',
    'technology',
    'telecommunications_media',
    'transportation_logistics',
    'utilities',
    'spac',
    'closed_end_fund',
    'private_company',
    'other'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type market_segment as enum ('main', 'ace', 'leap');
exception when duplicate_object then null; end $$;

-- ── STEP 2: client columns ────────────────────────────────────────────────
alter table public.clients
  add column if not exists ticker_code varchar(20),
  add column if not exists industry industry,
  add column if not exists market_segment market_segment,
  add column if not exists financial_year_end varchar(5),  -- 'MM-DD' e.g. '12-31'
  add column if not exists ceo_name varchar(255),
  add column if not exists cfo_name varchar(255),
  add column if not exists logo_url text;

-- ── STEP 3: Storage bucket for client logos ──────────────────────────────
insert into storage.buckets (id, name, public)
values ('client-logos', 'client-logos', true)
on conflict (id) do nothing;

-- Bucket is public for read; uploads/updates/deletes restricted to authenticated users
drop policy if exists "Authenticated upload to client-logos" on storage.objects;
create policy "Authenticated upload to client-logos"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'client-logos');

drop policy if exists "Authenticated update client-logos" on storage.objects;
create policy "Authenticated update client-logos"
  on storage.objects for update to authenticated
  using (bucket_id = 'client-logos') with check (bucket_id = 'client-logos');

drop policy if exists "Authenticated delete client-logos" on storage.objects;
create policy "Authenticated delete client-logos"
  on storage.objects for delete to authenticated
  using (bucket_id = 'client-logos');
