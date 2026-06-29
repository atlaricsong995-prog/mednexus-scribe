-- Fix MAR not rolling over to a new day (問題 2 follow-up).
-- Run in the Supabase SQL Editor against the live project. Idempotent.
--
-- The routine vitals timetable re-materialises today's cells on every window open
-- (ensureTodayRoutine) and queries only today (dayBounds). The MAR did neither: its
-- give-time cells were materialised once, at dispatch, and getTodayMedTasks had no
-- date bound. So the day AFTER dispatch the grid still showed yesterday's cells —
-- including yesterday's "given by …" signatures — under a "Today's give-times"
-- heading, and a multi-day order (e.g. Augmentin × 5 days) produced no give-times
-- for today at all. ensureTodayMeds (server) now fixes that the same way routine
-- does: an idempotent per-day upsert.
--
-- That upsert needs a unique index whose conflict target is the plain column list
-- (patient_id, med_key, scheduled_for). Migration 007's index was PARTIAL (`where
-- med_key is not null`); PostgREST's on_conflict can't supply the partial predicate
-- (same problem migration 008 fixed for routine cells). Replace it with a full
-- unique index. Non-MAR rows have med_key = NULL and NULLs are distinct, so ad-hoc /
-- routine tasks are unaffected; PRN cells carry scheduled_for = NULL (also distinct),
-- so multiple PRN administrations are still allowed.

-- 1. De-duplicate any existing MAR cells, keeping a charted one if present.
delete from public.tasks
where ctid in (
  select ctid from (
    select ctid,
           row_number() over (
             partition by patient_id, med_key, scheduled_for
             order by (completion_value is not null) desc, created_at asc
           ) as rn
    from public.tasks
    where med_key is not null
  ) ranked
  where ranked.rn > 1
);

-- 2. Replace the partial index with a full unique index (on_conflict-compatible).
drop index if exists public.tasks_med_unique;
create unique index if not exists tasks_med_unique
  on public.tasks (patient_id, med_key, scheduled_for);
