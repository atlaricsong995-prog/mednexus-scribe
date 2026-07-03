"use client";

import { useState } from "react";
import { Mic, Square, RotateCcw, Sparkles, Keyboard } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { useToast } from "@/hooks/use-toast";
import { useRecorder } from "@/hooks/use-recorder";
import { uploadRecording } from "@/app/doctor/actions";
import {
  NoteReviewPanel,
  type NoteReviewData,
} from "@/components/note-review-panel";
import { cn } from "@/lib/utils";

function fmt(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

// Pipeline phases after the doctor stops recording (Day 3, Task 3.4):
// upload → transcribe (Groq) → extract (Gemini) → review cards.
type Phase =
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "done"
  | "error"
  | null;

const PHASE_LABEL: Record<Exclude<Phase, null | "done" | "error">, string> = {
  uploading: "Saving recording…",
  transcribing: "Transcribing to English…",
  analyzing: "Extracting clinical note…",
};

export function Recorder({ patientId }: { patientId: string }) {
  const {
    status,
    seconds,
    audioBlob,
    audioUrl,
    error,
    supported,
    start,
    stop,
    reset,
  } = useRecorder();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>(null);
  const [transcript, setTranscript] = useState<string | null>(null);
  const [note, setNote] = useState<NoteReviewData | null>(null);
  // Input mode: dictate (mic → Whisper) or type the note directly. Typed text
  // skips transcription and feeds the same extract pipeline — it doubles as the
  // fallback when the mic/browser lets us down.
  const [mode, setMode] = useState<"voice" | "typed">("voice");
  const [typedNote, setTypedNote] = useState("");

  const busy =
    phase === "uploading" || phase === "transcribing" || phase === "analyzing";

  async function runPipeline() {
    if (!audioBlob) return;
    const ext = audioBlob.type.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.append("audio", audioBlob, `recording.${ext}`);
    form.append("patientId", patientId);
    form.append("durationSeconds", String(seconds));

    try {
      setPhase("uploading");
      const upload = await uploadRecording(form);
      if (!upload.ok) throw new Error(upload.error);

      setPhase("transcribing");
      const tRes = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioId: upload.recordingId,
          storagePath: upload.storagePath,
        }),
      });
      const tData = await tRes.json();
      if (!tRes.ok) throw new Error(tData.error ?? "Transcription failed.");
      setTranscript(tData.text);

      setPhase("analyzing");
      const eRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptionId: tData.transcriptionId,
          patientId,
        }),
      });
      const eData = await eRes.json();
      if (!eRes.ok) throw new Error(eData.error ?? "Extraction failed.");

      setNote(eData as NoteReviewData);
      setPhase("done");
    } catch (err) {
      setPhase("error");
      toast({
        variant: "destructive",
        title: "Pipeline failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    }
  }

  // Typed-note pipeline: no upload/transcribe — straight to extraction. The
  // server persists the typed text in the audit trail (no transcriptions row).
  async function runTypedPipeline() {
    const text = typedNote.trim();
    if (!text) return;
    try {
      setPhase("analyzing");
      const eRes = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ typedText: text, patientId }),
      });
      const eData = await eRes.json();
      if (!eRes.ok) throw new Error(eData.error ?? "Extraction failed.");

      setNote(eData as NoteReviewData);
      setPhase("done");
    } catch (err) {
      setPhase("error");
      toast({
        variant: "destructive",
        title: "Pipeline failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    }
  }

  function startOver() {
    setPhase(null);
    setTranscript(null);
    setNote(null);
    setTypedNote("");
    reset();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        {/* Voice ⇄ type switch — only before a take/typed run is in flight */}
        {status === "idle" && phase === null && (
          <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-medium">
            <button
              type="button"
              onClick={() => setMode("voice")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
                mode === "voice"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <Mic className="h-3.5 w-3.5" /> Dictate
            </button>
            <button
              type="button"
              onClick={() => setMode("typed")}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-1.5 transition",
                mode === "typed"
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              <Keyboard className="h-3.5 w-3.5" /> Type
            </button>
          </div>
        )}

        {mode === "typed" ? (
          <div className="flex w-full flex-col items-center gap-3">
            <textarea
              value={typedNote}
              onChange={(e) => setTypedNote(e.target.value)}
              disabled={busy || phase === "done"}
              rows={6}
              placeholder="Type your ward-round note — history, examination findings, assessment and plan…"
              className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:bg-slate-50 disabled:text-slate-500"
            />
            {phase === null && (
              <Button onClick={runTypedPipeline} disabled={!typedNote.trim()}>
                <Sparkles className="h-4 w-4" />
                Analyze note
              </Button>
            )}
            {busy && (
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <PulseLoader className="text-current" />
                Extracting clinical note…
              </div>
            )}
            {phase === "error" && (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={runTypedPipeline}>
                  <RotateCcw className="h-4 w-4" />
                  Retry
                </Button>
                <Button variant="outline" onClick={startOver}>
                  <Keyboard className="h-4 w-4" />
                  Start over
                </Button>
              </div>
            )}
            {phase === "done" && (
              <Button variant="outline" size="sm" onClick={startOver}>
                <Keyboard className="h-4 w-4" />
                New note
              </Button>
            )}
          </div>
        ) : (
          <>
        {/* Mic button (hidden once reviewing) */}
        {status !== "review" && (
          <button
            type="button"
            onClick={status === "recording" ? stop : start}
            disabled={!supported}
            aria-label={
              status === "recording" ? "Stop recording" : "Start recording"
            }
            className={cn(
              "relative flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40",
              status === "recording"
                ? "bg-red-600 hover:bg-red-700 focus-visible:ring-red-300"
                : "bg-slate-900 hover:bg-slate-800 focus-visible:ring-slate-300",
            )}
          >
            {status === "recording" && (
              <span className="absolute inset-0 animate-ping rounded-full bg-red-500 opacity-40" />
            )}
            {status === "recording" ? (
              <Square className="h-8 w-8 fill-current" />
            ) : (
              <Mic className="h-9 w-9" />
            )}
          </button>
        )}

        {status === "idle" && (
          <p className="text-sm text-slate-500">
            {supported
              ? "Tap to dictate your ward-round note"
              : "Audio recording is not supported on this browser."}
          </p>
        )}

        {status === "recording" && (
          <div className="flex items-center gap-2 text-lg font-semibold tabular-nums text-red-600">
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" />
            {fmt(seconds)}
          </div>
        )}

        {/* Review / pipeline state */}
        {status === "review" && audioUrl && (
          <div className="flex w-full flex-col items-center gap-4">
            <p className="text-sm font-medium text-slate-700">
              Recorded {fmt(seconds)}
            </p>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={audioUrl} controls className="w-full" />

            {phase === null && (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={runPipeline}>
                  <Sparkles className="h-4 w-4" />
                  Upload &amp; analyze
                </Button>
                <Button variant="outline" onClick={reset}>
                  <RotateCcw className="h-4 w-4" />
                  Re-record
                </Button>
              </div>
            )}

            {busy && (
              <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
                <PulseLoader className="text-current" />
                {PHASE_LABEL[phase as keyof typeof PHASE_LABEL]}
              </div>
            )}

            {phase === "error" && (
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
                <Button onClick={runPipeline}>
                  <RotateCcw className="h-4 w-4" />
                  Retry
                </Button>
                <Button variant="outline" onClick={startOver}>
                  <Mic className="h-4 w-4" />
                  New recording
                </Button>
              </div>
            )}

            {phase === "done" && (
              <Button variant="outline" size="sm" onClick={startOver}>
                <Mic className="h-4 w-4" />
                New recording
              </Button>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-600">{error}</p>}
          </>
        )}
      </div>

      {/* English transcript preview */}
      {transcript && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            English transcript
          </p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {transcript}
          </p>
        </div>
      )}

      {/* Structured review cards */}
      {note && <NoteReviewPanel data={note} />}
    </div>
  );
}
