-- Aegis 0026: table number on event guests.
--
-- Some events (IPO prospectus launches, gala dinners, AGMs with seating)
-- require pre-assigned tables. Capture as free-text — we've seen formats
-- like "5", "Table 12", "VIP-A", "Stage Left", and trying to enforce a
-- structure here just gets in the way of the actual seating chart.

alter table public.event_guests
  add column if not exists table_number varchar(32);

-- Index helps the future "show me everyone at table N" lookup; cheap on a
-- table that maxes out a few hundred rows per event.
create index if not exists event_guests_table_idx
  on public.event_guests(event_id, table_number)
  where table_number is not null;
