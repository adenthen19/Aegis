-- Aegis 0038: one-shot backfill for the datetime-local timezone bug.
--
-- Every form using <input type="datetime-local"> (event date, meeting
-- date, interview date, deliverable scheduled_at, project deadline)
-- submitted a bare local timestamp like "2026-05-09T14:30" with NO
-- offset. Postgres timestamptz interpreted these as UTC and stored
-- them as if the user had typed UTC — every existing row is shifted
-- by the operator's local UTC offset.
--
-- For Aegis (Kuala Lumpur, UTC+8) every stored time is 8 hours later
-- than what the user typed. We subtract 8 hours from each affected
-- column once.
--
-- The form-side fix in src/components/ui/form.tsx handles all NEW
-- writes correctly. This migration must run AFTER that fix is
-- deployed and BEFORE any new rows are created — otherwise rows
-- that were stored correctly under the new code would also get
-- shifted.
--
-- Affected columns (timestamptz, populated by datetime-local forms):
--   • events.event_date
--   • meetings.meeting_date
--   • media_interviews.interview_date
--   • deliverable_schedule.scheduled_at
--   • projects.deadline
--
-- date-only columns (financial_quarter, publication_date,
-- start_date / end_date on engagements, period_start / period_end on
-- PR-value reports, release_date on press releases, expected_publish_date
-- on interviews, birthday) are NOT affected — Postgres `date` has no
-- timezone interpretation.
--
-- Auto-set timestamps (created_at, updated_at, distributed_at when set
-- by setPressReleaseStatusAction, checked_in_at) are NOT affected —
-- those are written via `now()` / `new Date().toISOString()` and were
-- always UTC-correct.

update public.events
   set event_date = event_date - interval '8 hours';

update public.meetings
   set meeting_date = meeting_date - interval '8 hours';

update public.media_interviews
   set interview_date = interview_date - interval '8 hours';

update public.deliverable_schedule
   set scheduled_at = scheduled_at - interval '8 hours';

update public.projects
   set deadline = deadline - interval '8 hours'
 where deadline is not null;
