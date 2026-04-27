-- Aegis 0024: replace IPO status with 6 explicit Bursa-aligned stages.
--
-- Old values were `readiness` / `roadshow` / `pricing` (3 informal phases).
-- New values are the canonical stages of a Malaysian IPO process:
--
--   stage_1_pre_ipo          — Pre-IPO preparations
--   stage_2_approval         — Approval from authority (SC submission)
--   stage_3_underwriting     — Signing of underwriting agreement
--   stage_4_prospectus       — Prospectus launch
--   stage_5_balloting        — Balloting
--   stage_6_listing          — Listing
--
-- Postgres can't drop or rename enum values directly, so we go through text
-- to swap the type cleanly. Mapping for the old → new values is
-- approximate but sensible:
--   readiness → stage_1_pre_ipo  (preparation phase)
--   roadshow  → stage_4_prospectus (roadshow happens during prospectus launch)
--   pricing   → stage_5_balloting (pricing finalises around balloting)

-- 1. Drop default if present and convert to text so we can mutate the enum.
alter table public.clients alter column ipo_status drop default;
alter table public.clients alter column ipo_status type text;

-- 2. Map legacy values to the new stage names. Anything else (typos,
--    unexpected values) becomes NULL — safer than guessing wrong.
update public.clients
   set ipo_status = case ipo_status
     when 'readiness' then 'stage_1_pre_ipo'
     when 'roadshow'  then 'stage_4_prospectus'
     when 'pricing'   then 'stage_5_balloting'
     else null
   end;

-- 3. Drop the old enum and recreate with the new values.
drop type ipo_status;

create type ipo_status as enum (
  'stage_1_pre_ipo',
  'stage_2_approval',
  'stage_3_underwriting',
  'stage_4_prospectus',
  'stage_5_balloting',
  'stage_6_listing'
);

-- 4. Convert column back to the new enum.
alter table public.clients
  alter column ipo_status type ipo_status using ipo_status::ipo_status;
