// POST /api/notes/retarget (Enh Day 2 — right-patient fix)
// The right-patient check flagged that the dictation belongs to a DIFFERENT
// patient than the open chart. If the doctor opened the wrong bed but dictated
// the correct patient, this re-points the still-draft note to the right patient
// (and returns their allergies so the review panel re-derives D-008 inline flags
// against the correct allergy list). Draft-only — a confirmed/dispatched note
// must be voided instead (Day 4), never silently moved.
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { DEMO_DOCTOR_ID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { noteId?: string; patientId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { noteId, patientId } = body;
  if (!noteId || !patientId) {
    return NextResponse.json(
      { error: "Missing noteId or patientId." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  const { data: note, error: noteErr } = await supabase
    .from("clinical_notes")
    .select("id, status, patient_id")
    .eq("id", noteId)
    .maybeSingle();

  if (noteErr || !note) {
    return NextResponse.json({ error: "Note not found." }, { status: 404 });
  }
  if (note.status !== "draft") {
    return NextResponse.json(
      {
        error:
          "Only a draft note can be re-targeted. A confirmed note must be voided (entered in error) instead.",
      },
      { status: 409 },
    );
  }

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, full_name, bed_number, mrn, allergies")
    .eq("id", patientId)
    .maybeSingle();

  if (patientErr || !patient) {
    return NextResponse.json(
      { error: "Target patient not found." },
      { status: 404 },
    );
  }

  const { error: updateErr } = await supabase
    .from("clinical_notes")
    .update({ patient_id: patientId })
    .eq("id", noteId);

  if (updateErr) {
    return NextResponse.json(
      { error: `Could not re-target note: ${updateErr.message}` },
      { status: 500 },
    );
  }

  await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: "doctor",
    action: "retarget_note",
    entity_type: "clinical_note",
    entity_id: noteId,
    metadata: { from_patient_id: note.patient_id, to_patient_id: patientId },
  });

  return NextResponse.json({
    ok: true,
    allergies: patient.allergies ?? [],
    label: `Bed ${patient.bed_number} · ${patient.full_name} · ${patient.mrn}`,
  });
}
