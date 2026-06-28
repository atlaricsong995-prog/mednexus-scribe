"use server";

// MO propose-order (Enh Day 4, plan point 6 / locked decision 3). A resident (MO)
// cannot edit or issue orders directly — they propose one, which lands in the
// attending's ApprovalsPanel as a 'submitted' task tagged `proposed_by_mo`. The
// existing approve route promotes it to a formal order (no new workflow). Runs
// server-side with the service-role client (the demo has no auth session).
import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import { WARD } from "@/lib/constants";
import type { TaskPriority, TaskType } from "@/lib/supabase/types";

const TASK_TYPES: TaskType[] = ["medication", "observation", "procedure", "other"];
const PRIORITIES: TaskPriority[] = ["low", "normal", "high", "critical"];

export interface ProposeResult {
  ok: boolean;
  error?: string;
}

export async function proposeOrder(input: {
  patientId: string;
  description: string;
  taskType?: string;
  priority?: string;
}): Promise<ProposeResult> {
  const role = getRole();
  if (role !== "mo") {
    return { ok: false, error: "Only a medical officer may propose orders." };
  }
  const description = input.description?.trim();
  if (!input.patientId) return { ok: false, error: "Missing patient." };
  if (!description) return { ok: false, error: "Describe the proposed order." };

  const taskType: TaskType = TASK_TYPES.includes(input.taskType as TaskType)
    ? (input.taskType as TaskType)
    : "other";
  const priority: TaskPriority = PRIORITIES.includes(
    input.priority as TaskPriority,
  )
    ? (input.priority as TaskPriority)
    : "normal";

  const supabase = createAdminClient();
  const { error } = await supabase.from("tasks").insert({
    note_id: null,
    patient_id: input.patientId,
    ward: WARD,
    task_type: taskType,
    description,
    proposed_by_mo: true,
    priority,
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
    metadata: { patient_id: input.patientId, description, task_type: taskType },
  });

  return { ok: true };
}
