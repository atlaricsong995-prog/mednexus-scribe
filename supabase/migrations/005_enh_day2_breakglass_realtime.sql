-- Enh Day 2 (Chunk B) — realtime break-glass notification to the attending
-- Run in the Supabase SQL Editor against the live project (usfxllqonkbxjrudngnk).
-- Idempotent: safe to re-run.
--
-- When a non-doctor breaks the glass to view a masked record, the server writes an
-- audit_log row (action = 'break_glass_view'). To push that to the attending's
-- /doctor screen in realtime we (1) add audit_log to the realtime publication,
-- (2) set REPLICA IDENTITY FULL, and (3) expose a demo anon SELECT policy (the
-- browser subscribes with the anon key; Realtime honours RLS). Writes still go
-- server-side via the service-role client.

do $$
begin
  alter publication supabase_realtime add table public.audit_log;
exception
  when duplicate_object then null;  -- already in the publication
end $$;

alter table public.audit_log replica identity full;

alter table public.audit_log enable row level security;

drop policy if exists "demo_anon_read_audit" on public.audit_log;
create policy "demo_anon_read_audit"
  on public.audit_log
  for select
  to anon, authenticated
  using (true);
