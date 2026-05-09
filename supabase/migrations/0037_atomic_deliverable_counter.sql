-- Aegis 0037: atomic counter increments on client_deliverables.
--
-- Several action paths (press release status flips, schedule status flips,
-- media interview completion, manual deliverable bumps) use a read-then-
-- write pattern on `client_deliverables.completed_count`:
--
--   1. SELECT completed_count, target_count, kind
--   2. compute next = max(0, current + delta)
--   3. UPDATE completed_count = next, status = ...
--
-- That's racy. Two concurrent flips against the same commitment (kiosk
-- + admin tab, or two team members on different devices) read the same
-- `current`, both compute current+1, both write current+1 — losing an
-- increment. The on-track view drifts from reality.
--
-- This migration adds a Postgres RPC that does the increment atomically
-- inside the database. The status transition logic is preserved so the
-- caller side can be a single-line replacement of the read-then-write
-- helper. SECURITY INVOKER so the existing per-table RLS policies
-- continue to apply (matches what the JS client would do).

create or replace function public.bump_deliverable_counter(
  p_deliverable_id uuid,
  p_delta integer
) returns void
language plpgsql
security invoker
as $$
declare
  v_kind text;
  v_target integer;
  v_next integer;
begin
  -- Single UPDATE with a returning clause — the row is locked for the
  -- duration of the statement so concurrent calls serialise. We compute
  -- the new count + status from the OLD row's columns; the floor at 0
  -- prevents negative counters when undo flows fire faster than the
  -- previous flip's audit catches up.
  update public.client_deliverables
     set completed_count = greatest(0, completed_count + p_delta),
         status = case
           -- Recurring + capped commitments flip to 'completed' on hit.
           when kind = 'recurring'
             and target_count is not null
             and (completed_count + p_delta) >= target_count
             then 'completed'
           -- Hitting zero (e.g. deleting a distributed press release) flips
           -- back to 'pending' so the dashboard mirror reads accurately.
           when greatest(0, completed_count + p_delta) = 0
             then 'pending'
           else 'in_progress'
         end,
         updated_at = now()
   where client_deliverable_id = p_deliverable_id
   returning kind, target_count, completed_count
        into v_kind, v_target, v_next;

  -- No-op when the deliverable has been deleted between the caller's
  -- snapshot and now. Mirrors the original helper's behaviour (it
  -- silently returned).
  if not found then
    return;
  end if;
end;
$$;

comment on function public.bump_deliverable_counter(uuid, integer) is
  'Atomic increment/decrement of client_deliverables.completed_count with status transition. Replaces a read-then-write pattern that lost increments under concurrent flips. p_delta is typically +1 or -1.';
