-- Aegis 0034: door-floor compliance fields for IPO Prospectus Launch events.
--
-- Three things motivate this migration:
--
--   1. Accreditation. Bursa/SC events require us to verify the person at the
--      door is the named CMSRL holder (analysts) or accredited press card
--      holder (media). Today event_guests is a flat name/firm/email row with
--      no slot for those numbers, no honorific (Datuk/Tan Sri/etc.), no
--      preferred name to print on a badge, no language pref, no dietary tag.
--      We add those fields on the contact tables (analysts, media_contacts)
--      AND on event_guests so the kiosk has them at the door even when the
--      guest was imported by name only.
--
--   2. Substitute-on-arrival. The single most common door grey area is "X
--      sent Y from the same firm" — usually a junior associate showing up
--      for a CMSRL-holding analyst. Adds a self-FK substitute_for_guest_id
--      so a substitute row can point back at the original invitee. The
--      original invitee row stays as-is (checked_in=false), and the
--      reconciliation report can derive substitution counts from the FK.
--
--   3. Walk-in approval. For prospectus_launch events with quiet-period
--      rules, walk-ins must not auto-check-in until a supervisor approves.
--      Adds events.requires_walkin_approval and event_guests.walkin_status
--      ('pending' | 'approved' | NULL where NULL = pre-registered). New
--      audit actions split walkin_add into walkin_request + walkin_approve.

-- =====================================================================
-- 1. ENUMS
-- =====================================================================

do $$ begin
  -- Used on both contact tables and event_guests. 'pending' is the
  -- default — verification happens at the door (or pre-event) and
  -- flips it to 'verified'. 'expired' is for when CMSRL/press card
  -- has lapsed.
  create type accreditation_status as enum ('pending', 'verified', 'expired');
exception when duplicate_object then null;
end $$;

do $$ begin
  -- NULL = pre-registered guest (not a walk-in).
  -- 'pending' = walk-in submitted, awaiting supervisor approval.
  -- 'approved' = walk-in approved (supervisor or auto if approval not required).
  create type walkin_status as enum ('pending', 'approved');
exception when duplicate_object then null;
end $$;

-- =====================================================================
-- 2. ANALYSTS — accreditation + identity
-- =====================================================================

alter table public.analysts
  add column if not exists cmsrl_number varchar(64),
  add column if not exists accreditation_status accreditation_status not null default 'pending',
  add column if not exists honorific varchar(32),
  add column if not exists preferred_name varchar(255),
  add column if not exists language_pref varchar(8),
  add column if not exists dietary varchar(64);

comment on column public.analysts.cmsrl_number is
  'Capital Markets Services Representative''s License number. Required at door for sell-side analysts at IPO/prospectus events.';
comment on column public.analysts.honorific is
  'Datuk, Tan Sri, YBhg, Dr, etc. Surfaced on badges and door greetings.';
comment on column public.analysts.preferred_name is
  'Name as the analyst wishes it printed on the badge / greeted at the door. Often differs from legal full_name.';
comment on column public.analysts.language_pref is
  'ISO-639-1 hint for door staff: en, ms, zh, ta, etc. NULL = unspecified.';

create index if not exists analysts_cmsrl_idx on public.analysts(cmsrl_number)
  where cmsrl_number is not null;

-- =====================================================================
-- 3. MEDIA CONTACTS — press card + identity
-- =====================================================================

alter table public.media_contacts
  add column if not exists press_card_no varchar(64),
  add column if not exists accreditation_status accreditation_status not null default 'pending',
  add column if not exists honorific varchar(32),
  add column if not exists preferred_name varchar(255),
  add column if not exists language_pref varchar(8),
  add column if not exists dietary varchar(64);

comment on column public.media_contacts.press_card_no is
  'MIB / press card number. Required at door for accredited media at IPO/prospectus events.';

create index if not exists media_contacts_press_card_idx on public.media_contacts(press_card_no)
  where press_card_no is not null;

-- =====================================================================
-- 4. EVENTS — walk-in approval flag
-- =====================================================================

alter table public.events
  add column if not exists requires_walkin_approval boolean not null default false;

comment on column public.events.requires_walkin_approval is
  'When true, walk-ins land as walkin_status=pending and must be approved by a director/super_admin before checked_in flips true. Default off; turn on for prospectus launches and any quiet-period event.';

-- =====================================================================
-- 5. EVENT_GUESTS — accreditation snapshot + substitute + walk-in status
-- =====================================================================
--
-- Identity / accreditation columns are denormalised from the contact
-- tables. Reasons:
--   • Imports often arrive as "name + firm only" — no contact-table row exists.
--   • The door snapshot must survive contact-table edits made after the event.
--   • Kiosk search is fast on event_guests; joining to contact tables on
--     every keystroke would be a regression.

alter table public.event_guests
  add column if not exists honorific varchar(32),
  add column if not exists preferred_name varchar(255),
  add column if not exists language_pref varchar(8),
  add column if not exists dietary varchar(64),
  add column if not exists cmsrl_number varchar(64),
  add column if not exists press_card_no varchar(64),
  add column if not exists accreditation_status accreditation_status not null default 'pending',
  add column if not exists substitute_for_guest_id uuid
    references public.event_guests(guest_id) on delete set null,
  add column if not exists walkin_status walkin_status;

comment on column public.event_guests.substitute_for_guest_id is
  'When set, this guest is a same-firm substitute for the referenced original invitee (who typically did not attend). The original row stays in place — reconciliation reports can derive substitution counts from this FK.';
comment on column public.event_guests.walkin_status is
  'NULL = pre-registered. ''pending'' = walk-in awaiting supervisor approval. ''approved'' = walk-in approved (manually or auto when events.requires_walkin_approval is false).';

create index if not exists event_guests_walkin_status_idx
  on public.event_guests(event_id, walkin_status)
  where walkin_status is not null;

create index if not exists event_guests_substitute_for_idx
  on public.event_guests(substitute_for_guest_id)
  where substitute_for_guest_id is not null;

-- =====================================================================
-- 6. CHECK-IN AUDIT — new actions for the approval / substitute flows
-- =====================================================================
--
-- ALTER TYPE ADD VALUE is non-transactional, so each value gets its own
-- guarded do-block — same pattern as 0033.
--
-- Action vocabulary now reads:
--   • walkin_request  — usher submitted a walk-in; awaiting approval.
--   • walkin_approve  — supervisor approved a pending walk-in (also fires
--                       a separate 'checkin' row so totals stay consistent).
--   • walkin_reject   — supervisor rejected a pending walk-in. Row stays
--                       in event_guests (for trail) but checked_in=false.
--   • substitute_register — same-firm substitute registered at the door.
--   • walkin_add (existing) — kept for back-compat with events that have
--                       requires_walkin_approval = false (auto-approved
--                       walk-ins still emit walkin_add + checkin).

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'walkin_request'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'walkin_request';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'walkin_approve'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'walkin_approve';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'walkin_reject'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'walkin_reject';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_enum
     where enumlabel = 'substitute_register'
       and enumtypid = 'public.event_checkin_action'::regtype
  ) then
    alter type public.event_checkin_action add value 'substitute_register';
  end if;
end $$;
