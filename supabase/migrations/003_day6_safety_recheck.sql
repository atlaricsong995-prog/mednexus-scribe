-- Day 6 — Safety re-check on edit + nurse override badge (D-008 hardening)
-- Run in the Supabase SQL Editor against the live project (usfxllqonkbxjrudngnk).
-- Idempotent: safe to re-run.

-- tasks.safety_alert — when a doctor overrides a CRITICAL safety flag (e.g. gives
-- an allergy-conflicting drug), dispatch stamps the reason here so the nurse card
-- and control tower can show a red "allergy / override" badge on that task.
-- Null for ordinary tasks. Travels over Realtime (tasks already REPLICA IDENTITY
-- FULL from migration 002), so the badge shows on live-dispatched tasks too.
alter table public.tasks
  add column if not exists safety_alert text;
