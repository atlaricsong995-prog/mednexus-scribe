"use client";

import { useState } from "react";
import { Send, CheckCircle2, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  Medication,
  NurseTask,
  MedicalNote,
  SafetyFlag,
} from "@/lib/supabase/types";

export interface DispatchPayload {
  medical_note: MedicalNote;
  medications: Medication[];
  nurse_tasks: NurseTask[];
  safety_flags: SafetyFlag[];
}

interface ConfirmButtonProps {
  noteId: string;
  getPayload: () => DispatchPayload;
  criticalFlags: SafetyFlag[];
}

// Confirm & dispatch (Task 4.2). Calls /api/dispatch with the doctor's edited
// note. When there is a critical D-008 safety flag, the doctor must tick the
// override box (and may add a reason) before the button enables — the server
// re-enforces this and records the override in the audit log.
export function ConfirmButton({
  noteId,
  getPayload,
  criticalFlags,
}: ConfirmButtonProps) {
  const { toast } = useToast();
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ taskCount: number } | null>(null);

  const hasCritical = criticalFlags.length > 0;
  // A critical (allergy) flag is a hard safety stop: dispatch stays blocked until the
  // doctor both acknowledges AND documents a reason (Workstream A). The server
  // re-enforces this; the reason is logged and shown to the nurse on the MAR badge.
  const needsReason = hasCritical && acknowledged && !reason.trim();
  const blocked = hasCritical && (!acknowledged || !reason.trim());

  async function dispatch() {
    setSubmitting(true);
    try {
      const payload = getPayload();
      const res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          noteId,
          ...payload,
          override: hasCritical
            ? { acknowledged: true, reason: reason.trim() || null }
            : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message ?? data.error ?? "Dispatch failed.");
      }
      setResult({ taskCount: data.taskIds?.length ?? 0 });
      toast({
        title: "Note confirmed",
        description: `${data.taskIds?.length ?? 0} task(s) dispatched to ${
          (data.notifiedRoles ?? []).join(" + ") || "nurses"
        }.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Dispatch failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-center">
        <CheckCircle2 className="h-6 w-6 text-emerald-600" />
        <p className="text-sm font-medium text-emerald-800">
          Confirmed &amp; dispatched
        </p>
        <p className="text-xs text-emerald-700">
          {result.taskCount} task{result.taskCount === 1 ? "" : "s"} now live on
          the nurse + control-tower boards.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-1">
      {hasCritical && (
        <label
          className={cn(
            "flex items-start gap-2 rounded-lg border p-3 text-sm",
            acknowledged
              ? "border-amber-300 bg-amber-50"
              : "border-red-300 bg-red-50",
          )}
        >
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-red-600"
          />
          <span className="space-y-1.5">
            <span className="flex items-center gap-1.5 font-medium text-red-800">
              <ShieldAlert className="h-4 w-4 text-red-600" />
              Override required (D-008)
            </span>
            <span className="block text-red-700">
              This note has {criticalFlags.length} critical safety flag
              {criticalFlags.length === 1 ? "" : "s"}. I have reviewed and accept
              clinical responsibility for dispatching.
            </span>
            {acknowledged && (
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for override (required, shown to nurse)"
                className={cn(
                  "mt-1 bg-white",
                  needsReason && "border-red-400 focus-visible:ring-red-400",
                )}
                onClick={(e) => e.preventDefault()}
              />
            )}
          </span>
        </label>
      )}

      <Button
        onClick={dispatch}
        disabled={blocked || submitting}
        className="w-full"
      >
        {submitting ? (
          <PulseLoader className="text-current" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {submitting ? "Dispatching…" : "Confirm & dispatch"}
      </Button>
      {blocked && (
        <p className="text-center text-xs text-red-500">
          {needsReason
            ? "Enter a reason for the override to enable dispatch."
            : "Acknowledge the safety override above to enable dispatch."}
        </p>
      )}
    </div>
  );
}
