// PATCH /api/tasks/[id]/complete (Task 5.3)
// Nurse marks a task done → status='submitted' with the completion value/notes,
// awaiting doctor approval. The UPDATE rides Supabase Realtime to /doctor (for
// approval) and /control-tower (live feed). Server-side service-role only.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import { DEMO_NURSE_ID, DEMO_NURSE_NAME } from "@/lib/constants";
import {
  isAbnormal,
  isObsType,
  obsSeverity,
  OBSERVATION_CATALOG,
} from "@/lib/clinical/vocab";
import { getPostDoseMonitor } from "@/lib/clinical/post-dose";

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
  let body: { value?: string; notes?: string } = {};
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
  // Two-band severity (Workstream C): a value inside the critical band auto-escalates
  // to the attending (see the escalation insert below). Computed server-side so the
  // alert can always be justified from the recorded value.
  const severity = obsSeverity(task.obs_type, value);

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
      // Auto-stamped from the logged-in nurse's identity — no manual signature
      // field (問題 3, decision E). Each nurse account == one signer.
      completed_by_name: DEMO_NURSE_NAME,
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

  // Auto-escalation (Workstream C): a critical-band value notifies the attending
  // via the same audit_log 'escalation' channel the manual Escalate button uses, so
  // it lands in the /doctor inbox in realtime. Severity routing (not time-of-day) —
  // any critical value reaches the attending. Mildly-abnormal values do NOT escalate.
  if (severity === "critical") {
    const label =
      (isObsType(updated.obs_type) &&
        OBSERVATION_CATALOG[updated.obs_type].label) ||
      "Observation";
    await supabase.from("audit_log").insert({
      actor_id: DEMO_NURSE_ID,
      actor_role: "system",
      action: "escalation",
      entity_type: "patient",
      entity_id: updated.patient_id,
      metadata: {
        patient_id: updated.patient_id,
        role: "auto-monitor",
        message: `Critical ${label} ${updated.completion_value} — auto-escalated`,
        obs_type: updated.obs_type,
        value: updated.completion_value,
        severity: "critical",
        task_id: taskId,
      },
    });
  }

  // Post-dose monitoring (問題 2 — Level 2): when a MEDICATION cell is signed as
  // given, some drugs mandate a timed follow-up observation (e.g. a capillary blood
  // glucose ~1h after insulin / a sulfonylurea). We schedule it off the ACTUAL
  // give-time (`now`), not dispatch time, so its due time reflects reality. This
  // only fires for administered medications (med_key set) — an observation cell
  // never spawns another. The MAR cell transitions pending → approved exactly once
  // (status guard above), so the follow-up is created exactly once per dose.
  if (updated.med_key) {
    const monitor = getPostDoseMonitor(updated.description, updated.med_key);
    if (monitor) {
      const dueAt = new Date(
        Date.parse(now) + monitor.delayMinutes * 60_000,
      ).toISOString();
      const { error: followErr } = await supabase.from("tasks").insert({
        note_id: updated.note_id,
        patient_id: updated.patient_id,
        ward: updated.ward,
        task_type: "observation",
        description: monitor.label,
        obs_type: monitor.obs_type,
        routine_key: null,
        med_key: null,
        scheduled_for: dueAt,
        conditions: monitor.reason,
        safety_alert: null,
        priority: "high",
        status: "pending",
      });
      // Best-effort — the medication has already been charted; a follow-up insert
      // failure must not roll that back. Record it either way for governance.
      await supabase.from("audit_log").insert({
        actor_id: DEMO_NURSE_ID,
        actor_role: "system",
        action: "post_dose_monitor",
        entity_type: "task",
        entity_id: taskId,
        metadata: {
          patient_id: updated.patient_id,
          ward: updated.ward,
          med_key: updated.med_key,
          obs_type: monitor.obs_type,
          due_at: dueAt,
          delay_minutes: monitor.delayMinutes,
          created: !followErr,
          error: followErr?.message ?? null,
        },
      });
    }
  }

  return NextResponse.json({ task: updated });
}
