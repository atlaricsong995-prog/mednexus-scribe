"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type RecorderStatus = "idle" | "recording" | "review";

// Pick a mime type the current browser can actually record.
// iOS Safari only supports audio/mp4; Chrome/Firefox prefer audio/webm.
function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/mpeg",
  ];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

// Map getUserMedia/MediaRecorder failures to an actionable message instead of
// a single opaque "Could not start recording." The DOMException name tells us
// the real cause, which is what you actually need when a demo mic won't start.
function describeRecorderError(err: unknown): string {
  const insecure =
    typeof window !== "undefined" &&
    !window.isSecureContext &&
    location.hostname !== "localhost" &&
    location.hostname !== "127.0.0.1";
  if (insecure) {
    return `Microphone blocked: this page must be served over HTTPS (or localhost). Current origin "${location.origin}" is not a secure context.`;
  }
  if (err instanceof DOMException) {
    switch (err.name) {
      case "NotAllowedError":
      case "SecurityError":
        return "Microphone permission denied. Allow mic access in the browser site settings, then try again.";
      case "NotFoundError":
      case "OverconstrainedError":
        return "No microphone found. Plug in or enable an input device and try again.";
      case "NotReadableError":
        return "Microphone is busy — another app (Zoom, Meet, etc.) may be using it. Close it and try again.";
      default:
        return `Could not start recording (${err.name}: ${err.message}).`;
    }
  }
  return `Could not start recording (${
    err instanceof Error ? err.message : String(err)
  }).`;
}

export interface UseRecorder {
  status: RecorderStatus;
  seconds: number;
  audioBlob: Blob | null;
  audioUrl: string | null;
  error: string | null;
  supported: boolean;
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
}

export function useRecorder(): UseRecorder {
  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async () => {
    setError(null);
    if (!supported) {
      setError("This browser does not support audio recording.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setStatus("review");
        clearTimer();
        stopStream();
      };

      recorder.start();
      setSeconds(0);
      setStatus("recording");
      timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (err) {
      setError(describeRecorderError(err));
      stopStream();
    }
  }, [supported]);

  const stop = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    clearTimer();
    stopStream();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    recorderRef.current = null;
    chunksRef.current = [];
    setAudioBlob(null);
    setAudioUrl(null);
    setSeconds(0);
    setStatus("idle");
    setError(null);
  }, [audioUrl]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      clearTimer();
      stopStream();
    };
  }, []);

  return {
    status,
    seconds,
    audioBlob,
    audioUrl,
    error,
    supported,
    start,
    stop,
    reset,
  };
}
