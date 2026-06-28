-- Enh Day 1 — Structured observations + abnormal-vital highlight
-- Run in the Supabase SQL Editor against the live project (usfxllqonkbxjrudngnk).
-- Idempotent: safe to re-run.

-- tasks.obs_type — controlled observation key (bp/glucose/temp/spo2/hr/rr) for
-- vital-sign tasks, mirroring OBSERVATION_CATALOG in lib/clinical/vocab. Lets the
-- nurse get a fixed-unit input and lets the value be range-checked. Null for
-- medications, procedures, and generic tasks.
alter table public.tasks
  add column if not exists obs_type text;

-- tasks.abnormal — set true when a recorded observation value falls outside its
-- catalog normal range (computed server-side on completion via isAbnormal). The
-- nurse board + control tower render abnormal tasks in red. Travels over Realtime
-- (tasks already REPLICA IDENTITY FULL from migration 002).
alter table public.tasks
  add column if not exists abnormal boolean not null default false;
