-- Aegis 0002: convert clients.service_tier from single enum to array
-- and extend the enum with four new tier values.
--
-- IMPORTANT — Postgres requires ALTER TYPE ... ADD VALUE to run OUTSIDE a
-- transaction block. In the Supabase SQL Editor, run STEP 1 by itself first,
-- click Run, then run STEP 2.

-- ── STEP 1: extend the enum ─────────────────────────────────────────────
alter type service_tier add value if not exists 'ipo';
alter type service_tier add value if not exists 'agm_egm';
alter type service_tier add value if not exists 'social_media';
alter type service_tier add value if not exists 'event_management';

-- ── STEP 2: convert the column to an array (run after STEP 1 commits) ──
alter table public.clients alter column service_tier drop default;
alter table public.clients
  alter column service_tier type service_tier[]
  using array[service_tier]::service_tier[];
alter table public.clients alter column service_tier set default '{}';
