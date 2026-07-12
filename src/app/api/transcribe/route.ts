// POST /api/transcribe (Tech Spec §3.1)
// Downloads the persisted audio artifact, runs Gemini speech-to-text -> English,
// and saves the transcriptions row. Runs server-side with the service-role admin
// client (the demo has no Supabase auth session, so anon writes are blocked by RLS).
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { transcribeToEnglish } from "@/lib/ai/stt";
import { AUDIO_BUCKET, STT_MODEL } from "@/lib/constants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const started = Date.now();

  let body: { audioId?: string; storagePath?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const { audioId, storagePath } = body;
  if (!audioId || !storagePath) {
    return NextResponse.json(
      { error: "Missing audioId or storagePath." },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Pull the raw audio back from Storage (private bucket).
  const { data: blob, error: dlError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .download(storagePath);

  if (dlError || !blob) {
    return NextResponse.json(
      { error: `Could not load audio: ${dlError?.message ?? "not found"}` },
      { status: 500 },
    );
  }

  // Patient name biases the model toward the honorific+name ("Encik Lim Ah Kow")
  // instead of mishearing it as a common medical word. Best-effort — transcribe
  // still proceeds without it.
  let patientName: string | undefined;
  const { data: audioRow } = await supabase
    .from("audio_recordings")
    .select("patient_id")
    .eq("id", audioId)
    .maybeSingle();
  if (audioRow?.patient_id) {
    const { data: patientRow } = await supabase
      .from("patients")
      .select("full_name")
      .eq("id", audioRow.patient_id)
      .maybeSingle();
    patientName = patientRow?.full_name ?? undefined;
  }

  // Speech-to-text (retry once, then fail — Tech Spec §3.1).
  let transcript: { text: string; language: string | null };
  try {
    transcript = await transcribeToEnglish(blob, blob.type || "audio/webm", patientName);
  } catch {
    try {
      transcript = await transcribeToEnglish(blob, blob.type || "audio/webm", patientName);
    } catch (err) {
      return NextResponse.json(
        {
          error: `Transcription failed: ${
            err instanceof Error ? err.message : "unknown"
          }`,
        },
        { status: 500 },
      );
    }
  }

  const { data: row, error: insertError } = await supabase
    .from("transcriptions")
    .insert({
      audio_id: audioId,
      raw_text: transcript.text,
      source_language: transcript.language,
      // Column is still named whisper_model — kept as-is on purpose: renaming it
      // would mean a migration, and the value is what actually matters.
      whisper_model: STT_MODEL,
    })
    .select("id")
    .single();

  if (insertError || !row) {
    return NextResponse.json(
      {
        error: `Could not save transcription: ${
          insertError?.message ?? "unknown"
        }`,
      },
      { status: 500 },
    );
  }

  // Record the detected language on the audio artifact (best-effort).
  if (transcript.language) {
    await supabase
      .from("audio_recordings")
      .update({ language_detected: transcript.language })
      .eq("id", audioId);
  }

  await supabase.from("audit_log").insert({
    actor_role: "doctor",
    action: "transcribe_recording",
    entity_type: "transcription",
    entity_id: row.id,
    metadata: { audio_id: audioId, source_language: transcript.language },
  });

  return NextResponse.json({
    transcriptionId: row.id,
    text: transcript.text,
    sourceLanguage: transcript.language,
    durationMs: Date.now() - started,
  });
}
