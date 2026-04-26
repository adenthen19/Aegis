-- Aegis 0009: manual to-dos
-- Lets users add action items directly (not tied to a meeting) and optionally
-- link them to a client. This enables "pending to-dos" on the client profile.

alter table public.action_items
  alter column meeting_id drop not null;

alter table public.action_items
  add column if not exists client_id uuid references public.clients(client_id) on delete set null;

create index if not exists action_items_client_id_idx on public.action_items(client_id);

-- A row must be anchored to *something* — a meeting, a client, or a PIC —
-- otherwise it's an orphan with no place to surface. Pure personal to-dos
-- (no meeting / no client) are still valid because they show up on the
-- assignee's My To-Do page.
alter table public.action_items
  drop constraint if exists action_items_anchor_check;
alter table public.action_items
  add constraint action_items_anchor_check
  check (meeting_id is not null or client_id is not null or pic_user_id is not null);
