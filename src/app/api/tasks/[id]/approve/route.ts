// PATCH /api/tasks/[id]/approve (Task 5.6)
// Doctor approves a nurse-submitted task → status='approved'. Closes the loop;
// the UPDATE rides Realtime back to /nurse and /control-tower. Server-side
// service-role only.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_DOCTOR_ID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const taskId = params.id;
  const supabase = createAdminClient();

  const { data: task, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, status")
    .eq("id", taskId)
    .maybeSingle();

  if (fetchErr || !task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  if (task.status !== "submitted") {
    return NextResponse.json(
      { error: `Only submitted tasks can be approved (was '${task.status}').` },
      { status: 409 },
    );
  }

  const approvedAt = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("tasks")
    .update({ status: "approved", approved_at: approvedAt })
    .eq("id", taskId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: `Could not approve task: ${updateErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: "doctor",
    action: "approve_task",
    entity_type: "task",
    entity_id: taskId,
    metadata: {
      patient_id: updated.patient_id,
      ward: updated.ward,
      completion_value: updated.completion_value,
    },
  });

  return NextResponse.json({ task: updated });
}
