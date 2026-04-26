-- Aegis 0013: audit columns (created_by_user_id / updated_by_user_id)
--
-- Adds "who did it" columns to every business table, populated automatically
-- from auth.uid() so existing app code keeps working unchanged. Existing rows
-- are left with NULL — we don't fabricate authorship for historical data.
--
-- The auto-fill trigger handles three cases:
--   • normal app insert (auth.uid() set)        → both columns get the user id
--   • normal app update (auth.uid() set)        → updated_by_user_id refreshed
--   • service-role insert/update (auth.uid()=NULL) → columns left untouched,
--     so the admin client (used in user management) doesn't blow up

-- ---------------------------------------------------------------------------
-- 1. Helper trigger functions
-- ---------------------------------------------------------------------------

create or replace function public.set_audit_user_on_insert()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.created_by_user_id = coalesce(new.created_by_user_id, auth.uid());
    new.updated_by_user_id = coalesce(new.updated_by_user_id, auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.set_audit_user_on_update()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is not null then
    new.updated_by_user_id = auth.uid();
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Add columns + wire triggers (idempotent per table)
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
  audit_tables text[] := array[
    'clients',
    'analysts',
    'media_contacts',
    'projects',
    'meetings',
    'action_items',
    'meeting_attendees',
    'deliverable_templates',
    'client_deliverables',
    'deliverable_schedule',
    'deliverable_schedule_attendees'
  ];
begin
  foreach t in array audit_tables
  loop
    -- columns
    execute format(
      'alter table public.%I
         add column if not exists created_by_user_id uuid references public.profiles(user_id) on delete set null,
         add column if not exists updated_by_user_id uuid references public.profiles(user_id) on delete set null',
      t
    );

    -- index on created_by for "show me what I touched" queries
    execute format(
      'create index if not exists %I on public.%I(created_by_user_id)',
      t || '_created_by_idx', t
    );

    -- triggers
    execute format(
      'drop trigger if exists %I on public.%I',
      t || '_set_audit_insert', t
    );
    execute format(
      'create trigger %I before insert on public.%I
         for each row execute function public.set_audit_user_on_insert()',
      t || '_set_audit_insert', t
    );

    execute format(
      'drop trigger if exists %I on public.%I',
      t || '_set_audit_update', t
    );
    execute format(
      'create trigger %I before update on public.%I
         for each row execute function public.set_audit_user_on_update()',
      t || '_set_audit_update', t
    );
  end loop;
end $$;

-- meeting_attendees has a composite primary key (meeting_id, user_id) and no
-- updated_at, so we don't fire the update trigger on it. Drop it back off.
drop trigger if exists meeting_attendees_set_audit_update on public.meeting_attendees;
