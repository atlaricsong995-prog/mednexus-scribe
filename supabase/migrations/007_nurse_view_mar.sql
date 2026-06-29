-- Nurse-View Redesign (問題 2) — Medication Administration Record (MAR)
-- Run in the Supabase SQL Editor against the live project (usfxllqonkbxjrudngnk).
-- Idempotent: safe to re-run.
--
-- Turns medications from "one task per drug" into a MAR: each drug fans out into
-- one task per administration slot today (mirrors the routine vitals timetable).
-- Adds the two facets that needs:
--   * med_key          — non-null marks a task as a materialised MAR cell
--                        (e.g. 'med:augmentin'). Like routine_key, MAR cells live
--                        ONLY in the patient-window grid; the nurse board / control
--                        tower / doctor approvals all exclude them (see isGridCell).
--   * completed_by_name— demo nurse identity. The existing completed_by is a uuid
--                        (DEMO_NURSE_ID); a ward has several nurses and any of them
--                        may chart, so we record who as a plain name string (cookie
--                        set on the nurse port). Demo-grade — not a real account.
--
-- MAR cells, like routine cells, have no parent clinical_note narrative row of
-- their own beyond the dispatched note — note_id is already nullable (006).

alter table public.tasks
  add column if not exists med_key text;

alter table public.tasks
  add column if not exists completed_by_name text;

-- Idempotent materialisation guard: one MAR cell per (patient, drug, slot).
-- Partial — only MAR rows participate, so ad-hoc tasks are unaffected. PRN cells
-- have scheduled_for = null (no fixed time); the unique index treats nulls as
-- distinct, so multiple PRN administrations are allowed.
create unique index if not exists tasks_med_unique
  on public.tasks (patient_id, med_key, scheduled_for)
  where med_key is not null;
