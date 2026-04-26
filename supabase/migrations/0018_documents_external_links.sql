-- Aegis 0018: asset-light documents
--
-- Press releases (and most other docs) are usually drafted in Google Docs /
-- Drive and don't need to be re-uploaded into our Storage bucket. This
-- migration relaxes the documents table so a row can EITHER have a Storage
-- file (file_path) OR a link to an externally-hosted document (external_url).
--
-- The table-level invariant is enforced by a check constraint: exactly one
-- of the two must be set. file_path is no longer NOT NULL.

alter table public.documents
  add column if not exists external_url text;

alter table public.documents
  alter column file_path drop not null;

alter table public.documents
  drop constraint if exists documents_anchor_check;

alter table public.documents
  add constraint documents_anchor_check
  check (
    (file_path is not null and external_url is null)
    or (file_path is null and external_url is not null)
  );
