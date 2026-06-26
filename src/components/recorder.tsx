"use client";

import { useState, useTransition } from "react";
import { Mic, Square, Loader2, RotateCcw, Check, UploadCloud } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useRecorder } from "@/hooks/use-recorder";
import { uploadRecording } from "@/app/doctor/actions";
import { cn } from "@/lib/utils";

function fmt(total: number): string {
  const m = Math.floor(total / 60)
    .toString()
    .padStart(2, "0");
  const s = (total % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

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
  const [isUploading, startUpload] = useTransition();
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);

  function handleUpload() {
    if (!audioBlob) return;
    const ext = audioBlob.type.includes("mp4") ? "m4a" : "webm";
    const form = new FormData();
    form.append("audio", audioBlob, `recording.${ext}`);
    form.append("patientId", patientId);
    form.append("durationSeconds", String(seconds));

    startUpload(async () => {
      const result = await uploadRecording(form);
      if (result.ok) {
        setUploadedUrl(result.playbackUrl || audioUrl);
        toast({
          title: "Recording uploaded ✓",
          description: `${fmt(result.durationSeconds)} saved to patient record.`,
        });
      } else {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: result.error,
        });
      }
    });
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      {/* Mic button */}
      {status !== "review" && (
        <button
          type="button"
          onClick={status === "recording" ? stop : start}
          disabled={!supported}
          aria-label={status === "recording" ? "Stop recording" : "Start recording"}
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

      {/* Status line */}
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

      {/* Review state */}
      {status === "review" && audioUrl && (
        <div className="flex w-full flex-col items-center gap-4">
          <p className="text-sm font-medium text-slate-700">
            Recorded {fmt(seconds)}
          </p>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio src={uploadedUrl ?? audioUrl} controls className="w-full" />

          {uploadedUrl ? (
            <div className="flex items-center gap-2 text-sm font-medium text-emerald-600">
              <Check className="h-4 w-4" /> Saved to patient record
            </div>
          ) : (
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:justify-center">
              <Button onClick={handleUpload} disabled={isUploading}>
                {isUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UploadCloud className="h-4 w-4" />
                )}
                {isUploading ? "Uploading…" : "Upload recording"}
              </Button>
              <Button
                variant="outline"
                onClick={reset}
                disabled={isUploading}
              >
                <RotateCcw className="h-4 w-4" />
                Re-record
              </Button>
            </div>
          )}

          {uploadedUrl && (
            <Button variant="outline" size="sm" onClick={reset}>
              <Mic className="h-4 w-4" />
              New recording
            </Button>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
