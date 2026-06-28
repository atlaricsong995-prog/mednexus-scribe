"use server";

// Break-glass access (Enh Day 2). A non-doctor (nurse / MO / head nurse) may view
// an otherwise-masked medical record in an emergency, but must give a reason. The
// access is recorded in the append-only audit_log (governance), and only then is
// the record content returned to the client. Day 2 Chunk B adds the realtime
// notification to the attending doctor off this same audit row.
import { createAdminClient } from "@/lib/supabase/admin";
import { getRole } from "@/lib/server/role";
import {
  getLatestConfirmedNote,
  getRecordHistory,
} from "@/lib/server/patient-window-data";
import type { ClinicalNote } from "@/lib/supabase/types";

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
