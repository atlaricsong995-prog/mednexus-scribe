"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { BellRing, Check, ClipboardPen, Mic } from "lucide-react";

import { Button } from "@/components/ui/button";
import { HighlightOnMount } from "@/components/highlight-on-mount";
import { PulseLoader } from "@/components/pulse-loader";
import { useRealtimeTasks } from "@/hooks/use-realtime";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/supabase/types";
import {
  buildPatientMap,
  isGridCell,
  isUnauthorisedProposal,
  type PatientLite,
} from "@/lib/tasks";

// ApprovalsPanel (Task 5.6 + Enh Day 4) — the attending's live approval queue. Two
// kinds of item await sign-off: nurse task completions (carry a completion value)
// and resident-proposed orders (proposed_by_mo, no value yet). Toasts on each new
// arrival; [Approve] calls PATCH /api/tasks/[id]/approve to close the loop (realtime
// then drops it here and reflects it on the nurse + control-tower boards). Routine
// timetable cells never appear here — they record without approval.
export function ApprovalsPanel({
  ward,
  initialTasks,
  patients,
}: {
  ward: string;
  initialTasks: Task[];
  patients: PatientLite[];
}) {
  const { toast } = useToast();
  const patientMap = useMemo(() => buildPatientMap(patients), [patients]);
  const [approving, setApproving] = useState<string | null>(null);

  const notifySubmission = (task: Task) => {
    const p = patientMap.get(task.patient_id);
    toast({
      variant: task.abnormal ? "destructive" : undefined,
      title: task.proposed_by_mo
        ? "🩺 Resident proposed an order"
        : task.abnormal
          ? "⚠ Abnormal value ready for approval"
          : "Task ready for approval",
      description: `${p ? `Bed ${p.bed_number} · ` : ""}${task.description}${
        task.completion_value ? ` — ${task.completion_value}` : ""
      }`,
    });
  };

  const { tasks } = useRealtimeTasks(ward, {
    initialTasks,
    // MO proposals arrive as fresh INSERTs already in 'submitted'.
    onInsert: (task) => {
      if (task.status === "submitted" && !isGridCell(task)) notifySubmission(task);
    },
    onUpdate: (task, prev) => {
      if (
        task.status === "submitted" &&
        prev.status !== "submitted" &&
        !isGridCell(task)
      ) {
        notifySubmission(task);
      }
    },
  });

  const pending = tasks.filter((t) => t.status === "submitted" && !isGridCell(t));
  if (pending.length === 0) return null;

  // Split the queue: resident-proposed orders (awaiting authorisation, not yet
  // carried out) vs nurse completions (incl. of an MO order the nurse has now done —
  // it carries completed_by, so it belongs with completions, not proposals).
  const proposals = pending.filter((t) => isUnauthorisedProposal(t));
  const completions = pending.filter((t) => !isUnauthorisedProposal(t));

  // Two verbs for the one approve endpoint: AUTHORISE a resident proposal into a
  // live order vs ACKNOWLEDGE a nurse completion the nurse has already done (問題 3b).
  async function approve(taskId: string, kind: "proposal" | "completion") {
    setApproving(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not complete.");
      toast(
        kind === "proposal"
          ? { title: "Authorised", description: "Now a live order for the nurse." }
          : { title: "Acknowledged", description: "Nurse completion signed off." },
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: kind === "proposal" ? "Authorise failed" : "Acknowledge failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setApproving(null);
    }
  }

  const row = (t: Task, kind: "proposal" | "completion") => {
    const p = patientMap.get(t.patient_id);
    return (
      <HighlightOnMount key={t.id}>
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-lg border bg-white p-3",
            t.abnormal
              ? "border-red-300"
              : t.proposed_by_mo
                ? "border-sky-200"
                : "border-amber-200",
          )}
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-900">
              {t.description}
            </p>
            <p className="text-xs text-slate-500">
              {p ? `Bed ${p.bed_number} · ${p.full_name}` : "—"}
              {t.proposed_by_mo ? " · proposed by resident" : ""}
              {t.completion_value ? (
                <span className={cn(t.abnormal && "font-semibold text-red-600")}>
                  {" · "}
                  {t.completion_value}
                  {t.abnormal ? " ⚠ abnormal" : ""}
                </span>
              ) : (
                ""
              )}
              {t.completion_notes && !t.proposed_by_mo
                ? ` · ${t.completion_notes}`
                : ""}
            </p>
            {/* Resident's rationale (Workstream D) — their "why", to speed the
                attending's approve/reject decision. */}
            {t.proposed_by_mo && t.completion_notes && (
              <p className="mt-0.5 text-xs text-sky-700">
                Rationale: {t.completion_notes}
              </p>
            )}
            {/* Abnormal value the nurse flagged — let the doctor act on it (not just
                acknowledge) by jumping straight to dictating a new order (問題 3d). */}
            {t.abnormal && p && (
              <Link
                href={`/doctor/${encodeURIComponent(p.bed_number)}`}
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-600 underline-offset-2 hover:underline"
              >
                <Mic className="h-3.5 w-3.5" /> Dictate order →
              </Link>
            )}
          </div>
          <Button
            size="sm"
            onClick={() => approve(t.id, kind)}
            disabled={approving === t.id}
            className="shrink-0"
          >
            {approving === t.id ? (
              <PulseLoader className="text-current" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {kind === "proposal" ? "Authorise" : "Acknowledge"}
          </Button>
        </div>
      </HighlightOnMount>
    );
  };

  return (
    <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
        <BellRing className="h-4 w-4" />
        {pending.length} item{pending.length === 1 ? "" : "s"} awaiting your
        approval
      </h2>

      {proposals.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-sky-700">
            <ClipboardPen className="h-3.5 w-3.5" /> Resident-proposed orders (
            {proposals.length})
          </p>
          <div className="space-y-2">
            {proposals.map((t) => row(t, "proposal"))}
          </div>
        </div>
      )}

      {completions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-700">
            Nurse completions ({completions.length})
          </p>
          <div className="space-y-2">
            {completions.map((t) => row(t, "completion"))}
          </div>
        </div>
      )}
    </section>
  );
}
