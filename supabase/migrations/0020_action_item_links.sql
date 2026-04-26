-- Aegis 0020: link action items to commitments + auto-generation key
--
-- Some action_items are auto-spawned by the system (e.g. the quarterly
-- "confirm release date + request draft" pre-work todo that fires before each
-- regulatory results announcement). These rows need:
--
--   1. A back-link to the source commitment so the user can navigate to it
--      and so deleting the commitment can clean up its pre-work.
--   2. A stable identifier so re-running the seeder is idempotent.
--
-- Both columns are nullable — manual todos and meeting-derived action items
-- carry NULL on both.

alter table public.action_items
  add column if not exists client_deliverable_id uuid
    references public.client_deliverables(client_deliverable_id) on delete cascade,
  add column if not exists auto_generated_key text;

create index if not exists action_items_deliverable_idx
  on public.action_items(client_deliverable_id);

-- One auto-generated row per (commitment, key). Manual rows ignored.
create unique index if not exists action_items_auto_key_unique
  on public.action_items(client_deliverable_id, auto_generated_key)
  where auto_generated_key is not null;
