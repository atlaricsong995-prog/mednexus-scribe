// POST /api/alerts/[id]/ack — a doctor acknowledges a break-glass / escalation
// alert ("seen, handling it"), closing the loop. Alerts are append-only audit_log
// rows, so we don't mutate the original: we append an `alert_ack` row that references
// it (entity_id = the acknowledged alert's id). The inbox then filters out any alert
// that has a matching ack, and the realtime channel removes it from every open
// doctor/MO tab. Service-role only, consistent with the demo's no-auth model.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import { DEMO_DOCTOR_ID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only the two doctor roles run the alert inbox, so only they may acknowledge.
const ACK_ROLES = new Set(["doctor", "mo"]);
const ACK_ROLE_LABEL: Record<string, string> = {
  doctor: "Attending",
  mo: "Medical officer",
};

export async function POST(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const role = getRole();
  if (!role || !ACK_ROLES.has(role)) {
    return NextResponse.json(
      { error: "Only the attending or medical officer can acknowledge alerts." },
      { status: 403 },
    );
  }

  const alertId = params.id;
  const supabase = createAdminClient();

  // Confirm the alert exists (and is actually an alert) before recording an ack —
  // don't let a stray id write a dangling acknowledgement.
  const { data: alert } = await supabase
    .from("audit_log")
    .select("id, action")
    .eq("id", alertId)
    .maybeSingle();

  if (!alert || (alert.action !== "escalation" && alert.action !== "break_glass_view")) {
    return NextResponse.json({ error: "Alert not found." }, { status: 404 });
  }

  const { error: insertErr } = await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: role,
    action: "alert_ack",
    entity_type: "audit_log",
    entity_id: alertId,
    metadata: {
      acknowledged_by: ACK_ROLE_LABEL[role] ?? role,
      acknowledged_alert: alertId,
    },
  });

  if (insertErr) {
    return NextResponse.json(
      { error: `Could not acknowledge alert: ${insertErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, acknowledged: alertId });
}
