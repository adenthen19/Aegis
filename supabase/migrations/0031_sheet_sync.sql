-- Aegis 0031: two-way Google Sheets sync.
--
-- Adds two pieces:
--   1. A new audit source 'sheet' so check-ins / undos that originate from
--      a guest in the spreadsheet are distinguishable from kiosk and admin
--      activity in the post-event report.
--   2. events.google_sheet_owner_user_id — the user whose Google connection
--      the sync uses. This is set the first time the sheet is bound; if
--      that user later disconnects, the sync degrades gracefully and the
--      next manual push from another user re-binds it.

-- =====================================================================
-- 1. Extend the source enum with 'sheet'
-- =====================================================================
-- Postgres ALTER TYPE ADD VALUE is non-transactional, so we guard against
-- "already exists" so the migration is replayable.

do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumlabel = 'sheet'
      and enumtypid = 'public.event_checkin_source'::regtype
  ) then
    alter type public.event_checkin_source add value 'sheet';
  end if;
end $$;

-- =====================================================================
-- 2. Bind events to the user whose token drives the sync
-- =====================================================================

alter table public.events
  add column if not exists google_sheet_owner_user_id uuid
    references public.profiles(user_id) on delete set null;
