"use server";

// MO propose-order (Enh Day 4, plan point 6 / locked decision 3). A resident (MO)
// cannot edit or issue orders directly — they propose one, which lands in the
// attending's ApprovalsPanel as a 'submitted' task tagged `proposed_by_mo`. The
// existing approve route promotes it to a formal order (no new workflow). Runs
// server-side with the service-role client (the demo has no auth session).
import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import { findActiveDuplicate } from "@/lib/server/duplicate-check";
import { WARD } from "@/lib/constants";
import { medKey } from "@/lib/clinical/vocab";
import type { TaskPriority, TaskType } from "@/lib/supabase/types";

const TASK_TYPES: TaskType[] = ["medication", "observation", "procedure", "other"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "critical"];

export interface ProposeResult {
  ok: boolean;
  error?: string;
  // Advisory already-on-chart warning (2E): the proposal went through, but the
  // drug duplicates the active chart / an open resident order. Shown to the MO
  // as a toast; the same text rides the task's safety_alert to the attending.
  duplicateWarning?: string;
}

export async function proposeOrder(input: {
  patientId: string;
  description: string;
  taskType?: string;
  priority?: string;
  rationale?: string;
  drug?: string;
}): Promise<ProposeResult> {
  const role = getRole();
  if (role !== "mo") {
    return { ok: false, error: "Only a medical officer may propose orders." };
  }
  const description = input.description?.trim();
  if (!input.patientId) return { ok: false, error: "Missing patient." };
  if (!description) return { ok: false, error: "Describe the proposed order." };
  // Optional clinical rationale (Workstream D) — shown to the attending on the
  // approval card so they can judge the proposal quickly. Not mandatory.
  const rationale = input.rationale?.trim() || null;

  const taskType: TaskType = TASK_TYPES.includes(input.taskType as TaskType)
    ? (input.taskType as TaskType)
    : "other";
  const priority: TaskPriority = PRIORITIES.includes(
    input.priority as TaskPriority,
  )
    ? (input.priority as TaskPriority)
    : "normal";

  // A proposed MEDICATION carries its MAR med_key from day one, so once the
  // attending authorises it the med-keyed safety nets recognise the drug:
  // post-dose monitoring fires when the nurse signs it, and a later dictation
  // of the same drug trips the duplicate check. The task still lives on the
  // worklist (not the MAR grid) — isMedCell() excludes proposed_by_mo rows.
  const drugName = input.drug?.trim();
  const proposedMedKey =
    taskType === "medication" && drugName ? medKey(drugName) : null;

  // Already-on-chart / already-proposed duplicate check (2E). Advisory, not a
  // block: the proposal still goes through, but the warning rides safety_alert
  // so the attending sees it on the approval card before authorising.
  const duplicateWarning =
    proposedMedKey && drugName
      ? await findActiveDuplicate(input.patientId, drugName)
      : null;

  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").insert({
    note_id: null,
    patient_id: input.patientId,
    ward: WARD,
    task_type: taskType,
    description,
    med_key: proposedMedKey,
    proposed_by_mo: true,
    safety_alert: duplicateWarning,
    priority,
    // Rationale rides completion_notes (no schema change) — the approval card already
    // renders it; surfaced to the attending as the resident's "why".
    completion_notes: rationale,
    // Enters the attending's approval queue directly — no completion value yet.
    status: "submitted",
    submitted_at: new Date().toISOString(),
  });

  if (error) {
    return { ok: false, error: `Could not propose order: ${error.message}` };
  }

  await supabase.from("audit_log").insert({
    actor_role: "mo",
    action: "propose_order",
    entity_type: "patient",
    entity_id: input.patientId,
    metadata: {
      patient_id: input.patientId,
      description,
      task_type: taskType,
      rationale,
      duplicate_warning: duplicateWarning,
    },
  });

  return { ok: true, duplicateWarning: duplicateWarning ?? undefined };
}
