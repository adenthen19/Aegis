-- Update service_tier enum and change clients.service_tier to an array
-- Note: This should be run in the Supabase SQL Editor

-- 1. Add new values to the enum
ALTER TYPE service_tier ADD VALUE 'ipo';
ALTER TYPE service_tier ADD VALUE 'agm_egm';
ALTER TYPE service_tier ADD VALUE 'social_media';
ALTER TYPE service_tier ADD VALUE 'event_management';

-- 2. Change the column type to an array of the enum
-- We use a cast to convert existing single values into an array with one element.
ALTER TABLE clients 
  ALTER COLUMN service_tier TYPE service_tier[] 
  USING array[service_tier];
