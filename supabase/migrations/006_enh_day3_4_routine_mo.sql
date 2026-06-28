-- Enh Day 3 + 4 — Routine timetable + MO propose-order
-- Run in the Supabase SQL Editor against the live project (usfxllqonkbxjrudngnk).
-- Idempotent: safe to re-run.
--
-- Adds the two new task facets this round needs:
--   * routine_key   — non-null marks a task as a materialised routine-timetable
--                     cell (e.g. 'vitals:bp'). Routine cells live ONLY in the
--                     patient window grid; the nurse board / control tower / doctor
--                     approvals all exclude them so they don't drown the ad-hoc feed.
--   * proposed_by_mo— a resident (MO) cannot edit orders, only propose them. A
--                     proposed order is a status='submitted' task with this flag,
--                     surfaced in the attending's ApprovalsPanel and reusing the
--                     existing approve route to become a formal order.
--
-- Routine cells are not tied to a dictated note, so note_id must be nullable.

alter table public.tasks
  add column if not exists routine_key text;

alter table public.tasks
  add column if not exists proposed_by_mo boolean not null default false;

-- Routine cells (and MO proposals) have no parent clinical_note.
alter table public.tasks
  alter column note_id drop not null;

-- Idempotent materialisation guard: one routine cell per (patient, key, slot).
-- Partial — only routine rows participate, so ad-hoc tasks are unaffected.
create unique index if not exists tasks_routine_unique
  on public.tasks (patient_id, routine_key, scheduled_for)
  where routine_key is not null;

-- audit_log is already in the realtime publication with an anon read policy
-- (migration 005). The Day 4 escalation reuses it (action = 'escalation') — no
-- further grants needed.
