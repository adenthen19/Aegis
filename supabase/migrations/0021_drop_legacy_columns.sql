-- Aegis 0021: drop legacy columns
--
-- All of these were superseded by structured replacements but kept around
-- for backwards-compat. They've been unused by the UI for several migrations
-- and create confusion about where the truth lives. This migration:
--
--   1. Backfills meetings.summary from key_takeaways for any rows where
--      summary is null. This preserves takeaway content that's currently
--      surfaced as a fallback in several views.
--   2. Drops the legacy columns.
--   3. Drops the now-unused preferred_contact_method enum type.
--
-- meetings.attendees (free-text) is dropped without backfill. The replacement
-- is the meeting_attendees junction (added in 0007); the free-text column
-- has not been writable from the form since then, so any remaining values
-- are stale snapshots that can't be reconciled with the junction.
--
-- analysts.sentiment_score is intentionally KEPT — it's surfaced on the
-- dashboard's sentiment widget and will be the target column for Phase 4
-- AI sentiment scoring.

-- =====================================================================
-- 1. BACKFILL meetings.summary from key_takeaways
-- =====================================================================

update public.meetings
   set summary = key_takeaways
 where summary is null
   and key_takeaways is not null
   and length(trim(key_takeaways)) > 0;

-- =====================================================================
-- 2. DROP LEGACY COLUMNS
-- =====================================================================

alter table public.clients
  drop column if exists ceo_name,
  drop column if exists cfo_name,
  drop column if exists advisory_syndicate;

alter table public.meetings
  drop column if exists attendees,
  drop column if exists key_takeaways;

alter table public.analysts
  drop column if exists asset_class_focus,
  drop column if exists aum_bracket,
  drop column if exists interaction_history;

alter table public.media_contacts
  drop column if exists specific_beat_coverage,
  drop column if exists preferred_contact_method,
  drop column if exists recent_articles,
  drop column if exists social_media_profiles,
  drop column if exists spoc;

-- =====================================================================
-- 3. DROP UNUSED ENUM TYPE
-- =====================================================================
-- preferred_contact_method only existed for the dropped media_contacts
-- column. No other table or function references it.

drop type if exists preferred_contact_method;
