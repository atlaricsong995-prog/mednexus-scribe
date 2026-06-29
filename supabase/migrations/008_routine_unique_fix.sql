-- Fix routine-cell duplication (問題 2 follow-up).
-- Run in the Supabase SQL Editor against the live project. Idempotent.
--
-- ensureTodayRoutine now upserts with ignoreDuplicates, which needs a unique index
-- whose conflict target is the plain column list (patient_id, routine_key,
-- scheduled_for). The migration 006 index was PARTIAL (`where routine_key is not
-- null`); PostgREST's on_conflict can't supply the partial predicate, so we replace
-- it with a full unique index. Non-routine rows have routine_key = NULL and NULLs
-- are distinct, so ad-hoc / MAR tasks are unaffected (no false uniqueness).

-- 1. De-duplicate any existing routine cells, keeping a charted one if present.
delete from public.tasks
where ctid in (
  select ctid from (
    select ctid,
           row_number() over (
             partition by patient_id, routine_key, scheduled_for
             order by (completion_value is not null) desc, created_at asc
           ) as rn
    from public.tasks
    where routine_key is not null
  ) ranked
  where ranked.rn > 1
);

-- 2. Replace the partial index with a full unique index (on_conflict-compatible).
drop index if exists public.tasks_routine_unique;
create unique index if not exists tasks_routine_unique
  on public.tasks (patient_id, routine_key, scheduled_for);
