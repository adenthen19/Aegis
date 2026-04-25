-- Aegis 0005: simplify analyst capture
-- Adds the three new fields the form will collect (name, contact, email).
-- Legacy fields (asset_class_focus, aum_bracket, sentiment_score, interaction_history)
-- are intentionally left in place so existing rows keep their data.

alter table public.analysts
  add column if not exists full_name varchar(255),
  add column if not exists contact_number varchar(50),
  add column if not exists email varchar(255);

create index if not exists analysts_email_idx on public.analysts(email);
