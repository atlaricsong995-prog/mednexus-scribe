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

export type AlertKind = "break_glass_view" | "escalation";

// `kinds` scopes the inbox to the viewer's role: break-glass record-access
// alerts are the attending's to review, so the MO inbox requests escalations only.
// `excludeActorRole` keeps a viewer from being notified of their own actions —
// the MO's escalation goes to the attending, not back into the MO's inbox.
export async function getRecentAlerts(
  kinds: AlertKind[] = ["break_glass_view", "escalation"],
  excludeActorRole?: string,
  limit = 20,
): Promise<AlertRow[]> {
  const supabase = createAdminClient();
  // Acknowledged alerts are append-only `alert_ack` rows that reference the original
  // alert via entity_id. Pull the acked ids first so the backfill hides anything a
  // doctor has already closed (the realtime channel handles acks that arrive later).
  const [{ data }, { data: acks }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, actor_role, action, entity_id, metadata, created_at")
      .in("action", kinds)
      .order("created_at", { ascending: false })
      .limit(limit),
    supabase.from("audit_log").select("entity_id").eq("action", "alert_ack"),
  ]);
  const ackedIds = new Set(
    (acks ?? []).map((a) => a.entity_id).filter((id): id is string => !!id),
  );
  return ((data as AlertRow[]) ?? []).filter(
    (row) =>
      !ackedIds.has(row.id) &&
      (!excludeActorRole || row.actor_role !== excludeActorRole),
  );
}
