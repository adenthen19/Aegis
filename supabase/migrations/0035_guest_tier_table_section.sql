-- Aegis 0035: guest tiering + table sectioning.
--
-- Operationally, prospectus / IPO events already segregate seating by
-- audience: a VIP block (issuer execs, advisers, regulators), separate
-- analyst tables (sell-side / buy-side / KOL), a media row, and the rest.
-- That split is implicit today via free-text `event_tables.label` and
-- usher convention. This migration makes it formal so the kiosk and the
-- seating UI can:
--
--   • colour-code guests at a glance (top-tier coverage analysts get a
--     visible chip, VIPs are unmistakable, media stand out as a block);
--   • soft-warn when a tier is being seated outside its section
--     (e.g. an analyst handed a media-row seat — usher can override but
--     gets a tap-to-confirm prompt);
--   • produce a section-by-section breakdown on the post-event report.
--
-- Both fields are NOT NULL with sensible defaults so existing rows light
-- up as 'standard' / 'mixed' and downstream queries don't have to deal
-- with NULL semantics.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  -- Tier on event_guests. Drives kiosk badge colour, default seating,
  -- and the breakdown on the post-event reconciliation report.
  --   • vip       — issuer execs, regulators, observers, top sponsor reps
  --   • analyst   — sell-side / buy-side coverage analysts (CMSRL holders)
  --   • kol       — key opinion leaders / influencers (covered as a
  --                  separate table on most prospectus launches)
  --   • media     — accredited press / journalists / photographers
  --   • standard  — default for anyone not in the above buckets
  create type guest_tier as enum ('vip', 'analyst', 'kol', 'media', 'standard');
exception when duplicate_object then null;
end $$;

do $$ begin
  -- Section on event_tables. Mirrors guest_tier but adds 'mixed' for
  -- tables that genuinely seat a blend (often the back-row standard
  -- tables).
  create type table_section as enum ('vip', 'analyst', 'kol', 'media', 'mixed');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. EVENT_GUESTS — tier
-- =====================================================================

alter table public.event_guests
  add column if not exists tier guest_tier not null default 'standard';

comment on column public.event_guests.tier is
  'Audience bucket the guest belongs to. Drives kiosk colour-coding, default seating section, and the reconciliation breakdown. ''standard'' = catch-all default.';

-- Filter index: "show me all VIPs at this event" / "all media at this
-- event" is a common admin query for floor-staffing checklists.
create index if not exists event_guests_tier_idx
  on public.event_guests(event_id, tier)
  where tier <> 'standard';

-- =====================================================================
-- 3. EVENT_TABLES — section
-- =====================================================================

alter table public.event_tables
  add column if not exists section table_section not null default 'mixed';

comment on column public.event_tables.section is
  'Audience this table is reserved for. Soft constraint — kiosk warns when a guest''s tier doesn''t match, but never blocks (override is logged via capacity_override audit).';
