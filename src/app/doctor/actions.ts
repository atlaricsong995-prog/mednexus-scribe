"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { AUDIO_BUCKET, DEMO_DOCTOR_ID } from "@/lib/constants";

export type UploadResult =
  | {
      ok: true;
      recordingId: string;
      storagePath: string;
      playbackUrl: string;
      durationSeconds: number;
    }
  | { ok: false; error: string };

// Persist a recording: upload the audio blob to Storage, then write the
// audio_recordings row and an audit_log entry (governance rule A.3.4 — the raw
// artifact is persisted before any downstream AI step). Runs server-side with
// the service-role client because the demo has no Supabase auth session.
export async function uploadRecording(
  formData: FormData,
): Promise<UploadResult> {
  const file = formData.get("audio");
  const patientId = String(formData.get("patientId") ?? "");
  const durationSeconds = Number(formData.get("durationSeconds") ?? 0);

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "No audio data received." };
  }
  if (!patientId) {
    return { ok: false, error: "Missing patient." };
  }

  const supabase = createAdminClient();

  // mp4 (iOS Safari) or webm (Chrome/Firefox) — derive extension from mime.
  const ext = file.type.includes("mp4") ? "m4a" : "webm";
  const storagePath = `${patientId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(AUDIO_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "audio/webm",
      upsert: false,
    });

  if (uploadError) {
    return { ok: false, error: `Upload failed: ${uploadError.message}` };
  }

  const { data: recording, error: insertError } = await supabase
    .from("audio_recordings")
    .insert({
      patient_id: patientId,
      doctor_id: DEMO_DOCTOR_ID,
      storage_path: storagePath,
      duration_seconds: Math.round(durationSeconds) || null,
    })
    .select("id")
    .single();

  if (insertError || !recording) {
    // Roll back the orphaned object so Storage stays consistent.
    await supabase.storage.from(AUDIO_BUCKET).remove([storagePath]);
    return {
      ok: false,
      error: `Could not save recording: ${insertError?.message ?? "unknown"}`,
    };
  }

  await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: "doctor",
    action: "create_recording",
    entity_type: "audio_recording",
    entity_id: recording.id,
    metadata: { patient_id: patientId, storage_path: storagePath },
  });

  // Bucket is private — hand back a short-lived signed URL for playback.
  const { data: signed } = await supabase.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  return {
    ok: true,
    recordingId: recording.id,
    storagePath,
    playbackUrl: signed?.signedUrl ?? "",
    durationSeconds: Math.round(durationSeconds),
  };
}

// Discard unconfirmed drafts (the bed page restores abandoned drafts, so the
// doctor needs a way to throw them away and dictate afresh). Clears EVERY draft
// the patient has, not just the shown one — re-dictating can stack drafts, and
// "discard → an older draft pops up → discard again" reads as a bug. Guarded to
// status='draft' — a confirmed/archived note is part of the record and can never
// be deleted. The extractions remain traceable in the audit_log.
export async function discardDraft(
  noteId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!noteId) return { ok: false, error: "Missing note id." };
  const supabase = createAdminClient();

  // Resolve the patient from the clicked draft, then clear all their drafts.
  const { data: note } = await supabase
    .from("clinical_notes")
    .select("id, patient_id, status")
    .eq("id", noteId)
    .maybeSingle();
  if (!note || note.status !== "draft") {
    return { ok: false, error: "Draft not found (it may already be confirmed)." };
  }

  const { data: deleted, error } = await supabase
    .from("clinical_notes")
    .delete()
    .eq("patient_id", note.patient_id)
    .eq("status", "draft")
    .select("id");

  if (error) {
    return { ok: false, error: `Could not discard draft: ${error.message}` };
  }

  await supabase.from("audit_log").insert({
    actor_id: DEMO_DOCTOR_ID,
    actor_role: "doctor",
    action: "discard_draft",
    entity_type: "clinical_note",
    entity_id: noteId,
    metadata: {
      patient_id: note.patient_id,
      discarded_note_ids: (deleted ?? []).map((d) => d.id),
      discarded_count: deleted?.length ?? 0,
    },
  });

  return { ok: true };
}
