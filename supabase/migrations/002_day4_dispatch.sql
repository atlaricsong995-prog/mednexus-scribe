-- Day 4 — Confirm + Dispatch + Realtime (Tech Spec §2.1 / §2.3, D-008)
-- Run in the Supabase SQL Editor against the live project (usfxllqonkbxjrudngnk).
-- Idempotent: safe to re-run.

-- 1. D-008 落地 — persist the medication safety flags Gemini returns.
--    Day 3 only displayed them; clinical_notes now stores them as jsonb so the
--    dispatch override decision is auditable.
alter table public.clinical_notes
  add column if not exists safety_flags jsonb not null default '[]'::jsonb;

-- 2. Realtime on tasks (§2.3) — INSERT/UPDATE pushed to /nurse + /control-tower.
--    add table is not idempotent, so guard it.
do $$
begin
  alter publication supabase_realtime add table public.tasks;
exception
  when duplicate_object then null;  -- already in the publication
end $$;

-- REPLICA IDENTITY FULL so UPDATE payloads carry old/new rows over Realtime.
alter table public.tasks replica identity full;

-- 3. Demo read access for the anon role.
--    The demo has no Supabase auth session (cookie role-picker), so /nurse and
--    /control-tower subscribe with the anon key. Realtime only delivers rows the
--    subscriber can SELECT under RLS, so expose a permissive read policy.
--    (Writes still go server-side via the service-role client — see admin.ts.)
alter table public.tasks enable row level security;

drop policy if exists "demo_anon_read_tasks" on public.tasks;
create policy "demo_anon_read_tasks"
  on public.tasks
  for select
  to anon, authenticated
  using (true);
