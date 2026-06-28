// POST /api/dispatch (Tech Spec §3.3)
// Doctor confirms a draft clinical_note → this handler:
//   1. persists any edits + the D-008 safety_flags onto clinical_notes,
//   2. flips status to 'confirmed' (confirmed_at = now),
//   3. fans the medications + nurse_tasks out into tasks rows (Realtime then
//      pushes them to /nurse and /control-tower),
//   4. writes an audit_log entry (append-only governance record).
//
// Server-side service-role only — the demo has no Supabase auth session so all
// writes bypass the anon RLS wall via admin.ts (see B.3 architecture decision).
//
// D-008 enforcement: if any safety_flag is `critical`, dispatch is REFUSED (409)
// unless the doctor explicitly acknowledges/overrides. The override (and its
// reason) is recorded in the audit_log — this is the clinical-governance gate.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_DOCTOR_ID } from "@/lib/constants";
import { checkMedicationSafety } from "@/lib/safety";
import { ExtractSchema } from "@/lib/ai/schemas";
import type {
  Medication,
  NurseTask,
  SafetyFlag,
  TaskType,
} from "@/lib/supabase/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface DispatchBody {
  noteId?: string;
  medical_note?: unknown;
  medications?: unknown;
  nurse_tasks?: unknown;
  safety_flags?: unknown;
  override?: { acknowledged?: boolean; reason?: string };
}

// nurse_tasks have no explicit type — classify the description so the nurse/
// control-tower views can colour-code by task_type (Tech Spec §2.1 enum).
function classifyTask(text: string): TaskType {
  const t = text.toLowerCase();
  if (
    /\b(monitor|observe|observ|check|measure|record|vitals?|bp|blood pressure|bsl|blood sugar|glucose|temperature|temp|spo2|sats?|pulse|urine output|gcs|input|output|i\/?o)\b/.test(
      t,
    )
  )
    return "observation";
  if (
    /\b(insert|catheter|cannula|dressing|wound|suture|ecg|x-?ray|blood (test|sample)|venepuncture|swab|culture|procedure|drain|nbm)\b/.test(
      t,
    )
  )
    return "procedure";
  if (
    /\b(give|administer|inject|iv\b|im\b|infusion|drip|stat|tablet|medication|dose of)\b/.test(
      t,
    )
  )
    return "medication";
  return "other";
}

// Absolute ISO timestamps go to scheduled_for; relative intervals ("Q6H") have
// no fixed time, so keep them visible in the description instead.
function parseWhen(when: string): { scheduledFor: string | null; label: string } {
  const trimmed = when?.trim() ?? "";
  if (/\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    const ts = Date.parse(trimmed);
    if (!Number.isNaN(ts)) return { scheduledFor: new Date(ts).toISOString(), label: "" };
  }
  return { scheduledFor: null, label: trimmed };
}

function medicationDescription(m: Medication): string {
  const parts = [m.drug, m.dose, m.route, m.frequency]
    .map((p) => p?.trim())
    .filter(Boolean);
  let desc = parts.join(" ");
  const duration = m.duration?.trim();
  if (duration && !/^(as charted|stat|n\/?a|-)$/i.test(duration)) {
    desc += ` × ${duration}`;
  }
  return desc || m.drug;
}

export async function POST(req: Request) {
  let body: DispatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { noteId } = body;
  if (!noteId) {
    return NextResponse.json({ error: "Missing noteId." }, { status: 400 });
  }

  // Re-validate the (possibly edited) clinical payload with the same Zod schema
  // the extractor uses — a confirmed note must be as well-formed as a draft.
  const parsed = ExtractSchema.partial().safeParse({
    medical_note: body.medical_note,
    medications: body.medications,
    nurse_tasks: body.nurse_tasks,
    safety_flags: body.safety_flags,
    // icd10 is not edited here; satisfy the partial schema without it.
    icd10_suggestions: [],
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: `Invalid note payload: ${parsed.error.issues[0]?.message ?? "bad shape"}` },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Load the draft note (source of truth for patient/transcription + any fields
  // the client didn't send).
  const { data: note, error: noteErr } = await supabase
    .from("clinical_notes")
    .select(
      "id, patient_id, status, medical_note, medications, nurse_tasks, safety_flags",
    )
    .eq("id", noteId)
    .maybeSingle();

  if (noteErr || !note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  if (note.status === "confirmed") {
    return NextResponse.json(
      { error: "Note is already confirmed." },
      { status: 409 },
    );
  }

  // Patient context — `ward` drives nurse filtering, `allergies` feeds the
  // safety re-check below. Loaded before the gate so we can re-derive flags.
  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, ward, allergies")
    .eq("id", note.patient_id)
    .maybeSingle();

  if (patientErr || !patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  // Merge edits over the stored draft (client may omit unchanged sections).
  const medications = (parsed.data.medications ?? note.medications) as Medication[];
  const nurseTasks = (parsed.data.nurse_tasks ?? note.nurse_tasks) as NurseTask[];
  const medicalNote = parsed.data.medical_note ?? note.medical_note;

  // Re-derive D-008 flags from the FINAL (possibly edited) medication list, not
  // the stale extract-time flags — removing a drug clears its flag, adding a
  // dangerous one raises a new flag. We keep any extract-time flag whose drug is
  // still prescribed and that our deterministic rules didn't already catch (so a
  // Gemini-only catch isn't lost), but drop flags for removed drugs entirely.
  const recomputed = checkMedicationSafety(medications, patient.allergies ?? []);
  const clientFlags = (parsed.data.safety_flags ?? []) as SafetyFlag[];
  const stillPrescribed = (drug: string) =>
    medications.some((m) => {
      const a = m.drug.toLowerCase();
      const b = drug.toLowerCase();
      return a.includes(b) || b.includes(a);
    });
  const keptClientFlags = clientFlags.filter(
    (f) =>
      stillPrescribed(f.drug) &&
      !recomputed.some(
        (r) => r.type === f.type && r.drug.toLowerCase() === f.drug.toLowerCase(),
      ),
  );
  const safetyFlags = [...recomputed, ...keptClientFlags];

  // D-008 gate — refuse dispatch on an un-acknowledged critical flag.
  const criticalFlags = safetyFlags.filter((f) => f.severity === "critical");
  const overridden = body.override?.acknowledged === true;
  if (criticalFlags.length > 0 && !overridden) {
    return NextResponse.json(
      {
        error: "SAFETY_OVERRIDE_REQUIRED",
        message:
          "This note has a critical safety flag. The doctor must acknowledge and override before dispatch.",
        criticalFlags,
      },
      { status: 409 },
    );
  }

  // Drugs that were dispatched despite a critical flag — surfaced to the nurse
  // as an allergy/override badge on the medication task (Task #2).
  const overriddenCriticalDrugs = new Set(
    criticalFlags.map((f) => f.drug.toLowerCase()),
  );

  const confirmedAt = new Date().toISOString();

  // 1+2. Persist edits + safety flags, flip to confirmed.
  const { error: updateErr } = await supabase
    .from("clinical_notes")
    .update({
      medical_note: medicalNote,
      medications,
      nurse_tasks: nurseTasks,
      safety_flags: safetyFlags,
      status: "confirmed",
      confirmed_at: confirmedAt,
    })
    .eq("id", noteId);

  if (updateErr) {
    return NextResponse.json(
      { error: `Could not confirm note: ${updateErr.message}` },
      { status: 500 },
    );
  }

  // 3. Build tasks rows — medications + nurse_tasks (Tech Spec §2.1 mapping).
  const medicationRows = medications.map((m) => {
    const flag = criticalFlags.find(
      (f) => overriddenCriticalDrugs.has(m.drug.toLowerCase()) && f.drug.toLowerCase() === m.drug.toLowerCase(),
    );
    return {
      note_id: noteId,
      patient_id: note.patient_id,
      ward: patient.ward,
      task_type: "medication" as TaskType,
      description: medicationDescription(m),
      obs_type: null as string | null,
      scheduled_for: null,
      conditions: null,
      // Critical-flagged drug dispatched under doctor override → nurse alert.
      safety_alert: flag ? flag.reason : null,
      priority: flag ? ("high" as const) : ("normal" as const),
    };
  });

  const nurseRows = nurseTasks.map((t) => {
    const { scheduledFor, label } = parseWhen(t.when);
    const description = label ? `${t.task} (${label})` : t.task;
    return {
      note_id: noteId,
      patient_id: note.patient_id,
      ward: patient.ward,
      task_type: classifyTask(t.task),
      description,
      // Controlled observation type → nurse gets a fixed-unit input and the
      // recorded value is range-checked for the abnormal-vital highlight.
      obs_type: t.obs_type ?? null,
      scheduled_for: scheduledFor,
      conditions: t.conditions ?? null,
      safety_alert: null as string | null,
      priority: t.priority,
    };
  });

  const taskRows = [...medicationRows, ...nurseRows];

  let taskIds: string[] = [];
  if (taskRows.length > 0) {
    const { data: inserted, error: tasksErr } = await supabase
      .from("tasks")
      .insert(taskRows)
      .select("id");

    if (tasksErr) {
      // Note is already confirmed; surface the partial failure rather than
      // silently dropping tasks.
      return NextResponse.json(
        {
          error: `Note confirmed but task dispatch failed: ${tasksErr.message}`,
          noteId,
          status: "confirmed",
        },
        { status: 500 },
      );
    }
    taskIds = (inserted ?? []).map((r) => r.id);
  }

  // 4. Audit log (append-only) — capture the override decision for governance.
  await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: "doctor",
    action: "confirm_note",
    entity_type: "clinical_note",
    entity_id: noteId,
    metadata: {
      patient_id: note.patient_id,
      ward: patient.ward,
      task_ids: taskIds,
      task_count: taskIds.length,
      safety_flag_count: safetyFlags.length,
      critical_flag_count: criticalFlags.length,
      safety_override: criticalFlags.length > 0 ? overridden : false,
      override_reason: criticalFlags.length > 0 ? body.override?.reason ?? null : null,
    },
  });

  return NextResponse.json({
    noteId,
    status: "confirmed",
    taskIds,
    notifiedRoles: ["nurse", "head_nurse"],
  });
}
