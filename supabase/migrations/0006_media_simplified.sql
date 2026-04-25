-- Aegis 0006: simplify media contact capture
-- Adds the four new fields the form will collect.
-- Legacy fields (specific_beat_coverage, preferred_contact_method, recent_articles,
-- social_media_profiles, spoc) are kept so existing rows retain their data.

alter table public.media_contacts
  add column if not exists company_name varchar(255),
  add column if not exists state varchar(100),
  add column if not exists contact_number varchar(50),
  add column if not exists email varchar(255);

create index if not exists media_contacts_email_idx on public.media_contacts(email);
