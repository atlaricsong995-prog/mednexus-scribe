// POST /api/tasks/[id]/reject (2E, 2026-07-08)
// The attending rejects a resident-proposed order WITH a documented reason —
// the hierarchy's other half: a proposal the attending can only authorise (or
// silently ignore) isn't supervision. Append-only: the task flips to
// status='rejected' and a 'proposal_rejected' audit row carries the reason,
// which the MO's inbox subscribes to (kinds=["escalation","proposal_rejected"]).
// Service-role only, consistent with the demo's no-auth model.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import { DEMO_DOCTOR_ID } from "@/lib/constants";
import { isUnauthorisedProposal } from "@/lib/tasks";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  // Only the attending supervises proposals — the same boundary as Authorise.
  const role = getRole();
  if (role !== "doctor") {
    return NextResponse.json(
      { error: "Only the attending may reject a proposed order." },
      { status: 403 },
    );
  }

  const reason = ((await req.json().catch(() => ({})))?.reason ?? "")
    .toString()
    .trim();
  if (!reason) {
    return NextResponse.json(
      { error: "A rejection reason is required — the resident needs the why." },
      { status: 400 },
    );
  }

  const taskId = params.id;
  const supabase = createAdminClient();

  const { data: task, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, status, proposed_by_mo, completed_by, description, patient_id, ward")
    .eq("id", taskId)
    .maybeSingle();

  if (fetchErr || !task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  // Only a proposal still awaiting authorisation can be rejected. A nurse
  // completion is work already done — it gets acknowledged, never rejected;
  // and a proposal already authorised is a live order (discontinue is its exit).
  if (task.status !== "submitted" || !isUnauthorisedProposal(task)) {
    return NextResponse.json(
      { error: "Only a resident proposal awaiting authorisation can be rejected." },
      { status: 409 },
    );
  }

  const { data: updated, error: updateErr } = await supabase
    .from("tasks")
    .update({ status: "rejected" })
    .eq("id", taskId)
    .eq("status", "submitted") // guard the race: reject exactly once
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: `Could not reject: ${updateErr?.message ?? "already actioned"}` },
      { status: 409 },
    );
  }

  // The reason lives here, append-only. metadata.message is what the MO inbox
  // renders; patient_id lets it resolve the bed.
  await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: "doctor",
    action: "proposal_rejected",
    entity_type: "task",
    entity_id: taskId,
    metadata: {
      patient_id: updated.patient_id,
      ward: updated.ward,
      task_id: taskId,
      description: updated.description,
      reason,
      message: `Proposal rejected — “${updated.description}” — ${reason}`,
    },
  });

  return NextResponse.json({ task: updated });
}
