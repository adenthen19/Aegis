-- Aegis 0019: regulatory calendar foundation
--
-- Bursa Malaysia listing requirements impose hard statutory deadlines on
-- listed clients (quarterly results, annual report, AGM). The IR firm's job
-- is to make sure none slip. This migration adds two columns to
-- client_deliverables so an engagement can carry these deadlines as proper
-- deliverables, and so the seeding logic can be idempotent.
--
--   • due_date            — the statutory deadline (or any user-set deadline
--                           on a one-off deliverable).
--   • auto_generated_key  — a stable identifier for system-generated rows so
--                           we can re-run the seeder safely. NULL for
--                           manually-created rows.
--
-- The unique partial index ensures that re-running the seeder on the same
-- engagement doesn't create duplicates.

alter table public.client_deliverables
  add column if not exists due_date date,
  add column if not exists auto_generated_key text;

create index if not exists client_deliverables_due_date_idx
  on public.client_deliverables(due_date)
  where due_date is not null;

create unique index if not exists client_deliverables_auto_key_unique
  on public.client_deliverables(engagement_id, auto_generated_key)
  where auto_generated_key is not null;
