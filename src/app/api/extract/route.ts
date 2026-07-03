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
import {
  crossCheckPatient,
  type RosterPatient,
} from "@/lib/clinical/patient-match";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Gemini extraction can take a few seconds.
export const maxDuration = 60;

export async function POST(req: Request) {
  let body: { transcriptionId?: string; patientId?: string; typedText?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Two input modes share this pipeline: a saved Whisper transcription
  // (transcriptionId) or a note the doctor typed directly (typedText). Typed
  // notes skip transcribe entirely; everything downstream (extraction, safety
  // flags, right-patient check) is identical.
  const { transcriptionId, patientId } = body;
  const typedText = body.typedText?.trim() || undefined;
  if (!patientId || (!transcriptionId && !typedText)) {
    return NextResponse.json(
      { error: "Missing patientId, and one of transcriptionId or typedText." },
      { status: 400 },
    );
  }
  if (typedText && typedText.length > 10_000) {
    return NextResponse.json(
      { error: "Typed note is too long (max 10,000 characters)." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Fetch transcript + patient context server-side (don't trust the client for
  // dictations — the saved transcription row is canonical).
  const [{ data: transcription }, { data: patient }] = await Promise.all([
    transcriptionId
      ? supabase
          .from("transcriptions")
          .select("id, raw_text")
          .eq("id", transcriptionId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase
      .from("patients")
      .select("id, full_name, diagnosis, allergies, bed_number, mrn, ward")
      .eq("id", patientId)
      .maybeSingle(),
  ]);

  if (transcriptionId && !transcription) {
    return NextResponse.json(
      { error: "Transcription not found." },
      { status: 404 },
    );
  }
  if (!patient) {
    return NextResponse.json({ error: "Patient not found." }, { status: 404 });
  }

  const rawText = transcription?.raw_text ?? typedText!;

  // Gemini extraction (Zod-validated + one retry inside extractNote).
  let extracted;
  try {
    extracted = await extractNote(rawText, {
      name: patient.full_name,
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

  // Right-patient cross-check (soft, advisory) — does the dictation name a
  // DIFFERENT patient than the open chart? Match the transcript against the closed
  // ward roster (bounded → robust to accents). Best-effort; never blocks.
  let patientCheck = null;
  try {
    const { data: roster } = await supabase
      .from("patients")
      .select("id, full_name, bed_number, mrn")
      .eq("ward", patient.ward)
      .eq("active", true);
    patientCheck = crossCheckPatient(
      rawText,
      {
        id: patient.id,
        full_name: patient.full_name,
        bed_number: patient.bed_number,
        mrn: patient.mrn,
      },
      (roster as RosterPatient[]) ?? [],
    );
  } catch {
    // identity check is non-critical — proceed without it.
  }

  const { data: note, error: insertError } = await supabase
    .from("clinical_notes")
    .insert({
      patient_id: patientId,
      transcription_id: transcriptionId ?? null,
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
      transcription_id: transcriptionId ?? null,
      input_mode: transcriptionId ? "dictated" : "typed",
      // Typed notes have no transcriptions row — keep the verbatim source text
      // in the audit trail so the note stays traceable to its input.
      ...(typedText ? { typed_text: typedText } : {}),
      patient_id: patientId,
      safety_flag_count: extracted.safety_flags.length,
      patient_check: patientCheck?.status ?? null,
      patient_check_basis: patientCheck?.basis ?? null,
    },
  });

  return NextResponse.json({
    noteId: note.id,
    medical_note: extracted.medical_note,
    medications: extracted.medications,
    nurse_tasks: extracted.nurse_tasks,
    icd10_suggestions: extracted.icd10_suggestions,
    safety_flags: extracted.safety_flags,
    // Carried to the review panel so it can re-derive inline safety flags live
    // as the doctor edits the medication list (D-008).
    allergies: patient.allergies ?? [],
    // Soft right-patient advisory (Enh Day 2) — surfaced as a banner, not a block.
    patient_check: patientCheck,
  });
}
