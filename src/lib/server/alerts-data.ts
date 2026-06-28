// Server loader for the attending's alert inbox (Enh Day 4). Break-glass record
// views and escalations are append-only audit_log rows; the doctor's /doctor inbox
// backfills the recent ones here (the realtime channel only delivers events that
// happen after subscription). Service-role read, consistent with the demo.
import { createAdminClient } from "@/lib/supabase/admin";

export interface AlertRow {
  id: string;
  actor_role: string | null;
  action: string;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export async function getRecentAlerts(limit = 20): Promise<AlertRow[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audit_log")
    .select("id, actor_role, action, entity_id, metadata, created_at")
    .in("action", ["break_glass_view", "escalation"])
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as AlertRow[]) ?? [];
}
