-- Aegis 0022: birthdays on profiles
--
-- Stored as a real date so the year is preserved if the user wants to share
-- it, but UI comparisons only use month-day so the year is effectively
-- optional. NULL is the explicit "I'd rather not share" state — we don't
-- show the user's birthday popup or the "today is X's birthday" banner
-- when this is null.

alter table public.profiles
  add column if not exists birthday date;

create index if not exists profiles_birthday_md_idx
  on public.profiles((extract(month from birthday)), (extract(day from birthday)))
  where birthday is not null;
