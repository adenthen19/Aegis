-- Aegis 0028: enable Supabase Realtime on event_guests so multiple kiosks
-- on different devices stay in sync during a live event. When an usher
-- checks someone in on Kiosk A, the row UPDATE is broadcast over the
-- supabase_realtime publication and any other kiosk subscribed to the
-- event sees the change immediately — no refresh, no double tap.
--
-- Idempotent: only adds the table if it isn't already in the publication
-- so re-running the migration on an environment where realtime is already
-- enabled (e.g. via the Supabase dashboard) doesn't error.

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'event_guests'
  ) then
    alter publication supabase_realtime add table public.event_guests;
  end if;
end $$;
