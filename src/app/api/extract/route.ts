// POST /api/extract (Tech Spec §3.2)
// Reads a saved transcription + patient context, calls Gemini for structured
// clinical extraction (D-009), validates with Zod, and persists a draft
// clinical_notes row. Server-side service-role only (RLS — see admin.ts).
//
// safety_flags (D-008) are returned for display but NOT persisted on Day 3 —
// clinical_notes has no safety_flags column yet (added Day 4 with dispatch).
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { extractNote } from "@/lib/ai/gemini";
import { DEMO_DOCTOR_ID } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini extraction can take a few seconds.
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { transcriptionId?: string; patientId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { transcriptionId, patientId } = body;
  if (!transcriptionId || !patientId) {
    return NextResponse.json(
      { error: "Missing transcriptionId or patientId." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Fetch transcript + patient context server-side (don't trust the client).
  const [{ data: transcription }, { data: patient }] = await Promise.all([
    supabase
      .from("transcriptions")
      .select("id, raw_text")
      .eq("id", transcriptionId)
      .maybeSingle(),
    supabase
      .from("patients")
      .select("id, full_name, age, diagnosis, allergies")
      .eq("id", patientId)
      .maybeSingle(),
  ]);

  if (!transcription) {
    return NextResponse.json(
      { error: "Transcription not found." },
      { status: 404 },
    );
  }
  if (!patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  // Gemini extraction (Zod-validated + one retry inside extractNote).
  let extracted;
  try {
    extracted = await extractNote(transcription.raw_text, {
      name: patient.full_name,
      age: patient.age,
      diagnosis: patient.diagnosis,
      allergies: patient.allergies ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `Extraction failed: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      },
      { status: 500 },
    );
  }

  const { data: note, error: insertError } = await supabase
    .from("clinical_notes")
    .insert({
      patient_id: patientId,
      transcription_id: transcriptionId,
      doctor_id: DEMO_DOCTOR_ID,
      medical_note: extracted.medical_note,
      medications: extracted.medications,
      nurse_tasks: extracted.nurse_tasks,
      icd10_suggestions: extracted.icd10_suggestions,
      status: "draft",
    })
    .select("id")
    .single();

  if (insertError || !note) {
    return NextResponse.json(
      {
        error: `Could not save note: ${insertError?.message ?? "unknown"}`,
      },
      { status: 500 },
    );
  }

  await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: "doctor",
    action: "extract_note",
    entity_type: "clinical_note",
    entity_id: note.id,
    metadata: {
      transcription_id: transcriptionId,
      patient_id: patientId,
      safety_flag_count: extracted.safety_flags.length,
    },
  });

  return NextResponse.json({
    noteId: note.id,
    medical_note: extracted.medical_note,
    medications: extracted.medications,
    nurse_tasks: extracted.nurse_tasks,
    icd10_suggestions: extracted.icd10_suggestions,
    safety_flags: extracted.safety_flags,
  });
}
