// PATCH /api/tasks/[id]/complete (Task 5.3)
// Nurse marks a task done → status='submitted' with the completion value/notes,
// awaiting doctor approval. The UPDATE rides Supabase Realtime to /doctor (for
// approval) and /control-tower (live feed). Server-side service-role only.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import { DEMO_NURSE_ID } from "@/lib/constants";
import { isAbnormal } from "@/lib/clinical/vocab";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  // RBAC: the head nurse's view is read-only — she monitors, she doesn't chart.
  if (getRole() === "head_nurse") {
    return NextResponse.json(
      { error: "The head nurse view is read-only." },
      { status: 403 },
    );
  }

  const taskId = params.id;
  let body: { value?: string; notes?: string; nurseName?: string } = {};
  try {
    body = await req.json();
  } catch {
    // body is optional — observations may have a value, simple tasks may not.
  }

  const supabase = createAdminClient();

  const { data: task, error: fetchErr } = await supabase
    .from("tasks")
    .select("id, status, obs_type, routine_key, med_key")
    .eq("id", taskId)
    .maybeSingle();

  if (fetchErr || !task) {
    return NextResponse.json({ error: "Task not found." }, { status: 404 });
  }
  if (task.status !== "pending" && task.status !== "in_progress") {
    return NextResponse.json(
      { error: `Task cannot be completed from status '${task.status}'.` },
      { status: 409 },
    );
  }

  const value = body.value?.trim() || null;
  // Range-check observation values against OBSERVATION_CATALOG (server-authoritative
  // — don't trust a client-sent flag). Abnormal vitals render red on the boards.
  const abnormal = isAbnormal(task.obs_type, value);

  // Charted-not-approved cells record straight to 'approved' so they never clutter
  // the attending's approval queue: routine vitals (Enh Day 3) and MAR drug
  // administrations (問題 2 — the nurse signs the give, it isn't re-approved by a
  // doctor). Ad-hoc nurse tasks still go via 'submitted' for sign-off.
  const recordDirect = !!task.routine_key || !!task.med_key;
  const now = new Date().toISOString();
  const { data: updated, error: updateErr } = await supabase
    .from("tasks")
    .update({
      status: recordDirect ? "approved" : "submitted",
      completion_value: value,
      completion_notes: body.notes?.trim() || null,
      abnormal,
      completed_by: DEMO_NURSE_ID,
      // Demo nurse identity — who charted/administered (decision E).
      completed_by_name: body.nurseName?.trim() || null,
      submitted_at: now,
      approved_at: recordDirect ? now : null,
    })
    .eq("id", taskId)
    .select("*")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      { error: `Could not submit task: ${updateErr?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  await supabase.from("audit_log").insert({
    actor_id: DEMO_NURSE_ID,
    actor_role: "nurse",
    action: "complete_task",
    entity_type: "task",
    entity_id: taskId,
    metadata: {
      patient_id: updated.patient_id,
      ward: updated.ward,
      completion_value: updated.completion_value,
      completion_notes: updated.completion_notes,
      obs_type: updated.obs_type,
      abnormal: updated.abnormal,
      completed_by_name: updated.completed_by_name,
    },
  });

  return NextResponse.json({ task: updated });
}
