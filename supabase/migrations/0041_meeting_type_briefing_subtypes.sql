-- Aegis 0041: split the generic 'briefing' meeting_type into the buckets the
-- 1-Year Engagement Summary PDF needs to distinguish.
--
-- The sample SAG report tables analyst/investor activity as four distinct rows
-- (analyst briefing, investor 1-to-1, investor deck delivery, webinar), but
-- meeting_type today is just 'internal' | 'briefing' — too coarse to bucket
-- a meeting into the right column at report time.
--
-- We ADD VALUE rather than ALTER+rename so existing rows stay valid; users
-- can re-classify a stale 'briefing' row when they next edit it. The legacy
-- 'briefing' value remains usable but new UI defaults to the more specific
-- subtypes.
--
-- Note: Postgres requires ALTER TYPE ... ADD VALUE to run outside a
-- transaction. Each statement stands on its own (and IF NOT EXISTS makes the
-- migration idempotent if re-run partially).

ALTER TYPE meeting_type ADD VALUE IF NOT EXISTS 'analyst_briefing';
ALTER TYPE meeting_type ADD VALUE IF NOT EXISTS 'investor_one_to_one';
ALTER TYPE meeting_type ADD VALUE IF NOT EXISTS 'investor_deck_delivery';
ALTER TYPE meeting_type ADD VALUE IF NOT EXISTS 'webinar';
