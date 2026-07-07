"use server";

// Break-glass access (Enh Day 2). A non-doctor (nurse / MO / head nurse) may view
// an otherwise-masked medical record in an emergency, but must give a reason. The
// access is recorded in the append-only audit_log (governance), and only then is
// the record content returned to the client. Day 2 Chunk B adds the realtime
// notification to the attending doctor off this same audit row.
import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import { instructionKey } from "@/lib/clinical/watch-for";
import { gridObsOrderSlots } from "@/lib/clinical/obs-routing";
import { isObsType, routineKey } from "@/lib/clinical/vocab";
import {
  getLatestConfirmedNote,
  getRecordHistory,
} from "@/lib/server/patient-window-data";
import type { ClinicalNote, NurseTask } from "@/lib/supabase/types";

export interface BreakGlassResult {
  ok: boolean;
  error?: string;
  note?: ClinicalNote | null;
  history?: ClinicalNote[];
}

export async function breakGlassViewRecord(
  patientId: string,
  reason: string,
): Promise<BreakGlassResult> {
  const role = getRole();
  const trimmed = reason?.trim();
  if (!trimmed) {
    return { ok: false, error: "A reason is required to break the glass." };
  }
  if (!patientId) {
    return { ok: false, error: "Missing patient." };
  }

  const supabase = createAdminClient();

  // Append-only governance record FIRST — the access is logged whether or not the
  // record loads, so there is no silent peek.
  await supabase.from("audit_log").insert({
    actor_role: role ?? "unknown",
    action: "break_glass_view",
    entity_type: "patient",
    entity_id: patientId,
    metadata: { reason: trimmed, patient_id: patientId, role: role ?? "unknown" },
  });

  const [note, history] = await Promise.all([
    getLatestConfirmedNote(patientId),
    getRecordHistory(patientId),
  ]);
  return { ok: true, note, history };
}

// Escalate to the attending (Enh Day 4, plan point 4). A nurse or resident raises
// the patient to the attending's attention; the alert rides the audit_log realtime
// channel (migration 005) to the doctor's /doctor inbox. One tap — no order is
// created, this is a notification. The append-only audit row is the governance trail.
export interface EscalateResult {
  ok: boolean;
  error?: string;
}

export async function escalateToAttending(
  patientId: string,
  message?: string,
): Promise<EscalateResult> {
  const role = getRole();
  if (!patientId) {
    return { ok: false, error: "Missing patient." };
  }
  if (role !== "nurse" && role !== "mo" && role !== "head_nurse") {
    return { ok: false, error: "Only ward staff may escalate." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_log").insert({
    actor_role: role,
    action: "escalation",
    entity_type: "patient",
    entity_id: patientId,
    metadata: {
      patient_id: patientId,
      role,
      message: message?.trim() || "Requesting attending review.",
    },
  });

  if (error) {
    return { ok: false, error: `Could not escalate: ${error.message}` };
  }
  return { ok: true };
}

// Discontinue a Special Instruction (2026-07-04 spec). Attending-only — the
// stop is symmetric with ordering authority; the MO deliberately has no path
// here. One tap, no reason field (user decision): the append-only audit row
// (who + when) is the accountability trail. computeWatchFor hides a key whose
// latest discontinue postdates the newest note carrying it, so a later
// re-order simply revives the instruction — new order beats old stop.
export interface DiscontinueResult {
  ok: boolean;
  error?: string;
}

export async function discontinueInstruction(
  patientId: string,
  task: string,
): Promise<DiscontinueResult> {
  const role = getRole();
  if (role !== "doctor") {
    return {
      ok: false,
      error: "Only the attending doctor may discontinue an instruction.",
    };
  }
  const label = task?.trim();
  if (!patientId || !label) {
    return { ok: false, error: "Missing patient or instruction." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_log").insert({
    actor_role: role,
    action: "instruction_discontinued",
    entity_type: "patient",
    entity_id: patientId,
    metadata: {
      patient_id: patientId,
      task_key: instructionKey(label),
      task: label,
      role,
    },
  });
  if (error) {
    return { ok: false, error: `Could not discontinue: ${error.message}` };
  }

  // If the discontinued instruction is an ORDERED grid observation ("BSL QDS"
  // charts as a dynamic timetable row), stopping the order also cancels its
  // remaining UN-charted cells — signed readings stay as history, and a later
  // re-order re-materialises fresh cells (new order beats old stop). Find the
  // newest note carrying this instruction to recover its obs_type/cadence.
  const key = instructionKey(label);
  const [current, history] = await Promise.all([
    getLatestConfirmedNote(patientId),
    getRecordHistory(patientId),
  ]);
  let ordered: NurseTask | null = null;
  for (const n of [current, ...history]) {
    const hit = (n?.nurse_tasks ?? []).find(
      (t) => instructionKey(t.task) === key,
    );
    if (hit) {
      ordered = hit;
      break;
    }
  }
  if (ordered && isObsType(ordered.obs_type) && gridObsOrderSlots(ordered)) {
    await supabase
      .from("tasks")
      .delete()
      .eq("patient_id", patientId)
      .eq("routine_key", routineKey(ordered.obs_type))
      .eq("status", "pending")
      .is("completion_value", null);
  }

  return { ok: true };
}
