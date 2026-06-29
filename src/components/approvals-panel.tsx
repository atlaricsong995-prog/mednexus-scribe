"use client";

import { useMemo, useState } from "react";
import { BellRing, Check, Loader2, ClipboardPen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRealtimeTasks } from "@/hooks/use-realtime";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/supabase/types";
import { buildPatientMap, isGridCell, type PatientLite } from "@/lib/tasks";

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

  // Split the queue: resident-proposed orders vs nurse completions.
  const proposals = pending.filter((t) => t.proposed_by_mo);
  const completions = pending.filter((t) => !t.proposed_by_mo);

  async function approve(taskId: string) {
    setApproving(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not approve.");
      toast({ title: "Approved", description: "Task closed." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Approve failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setApproving(null);
    }
  }

  const row = (t: Task) => {
    const p = patientMap.get(t.patient_id);
    return (
      <div
        key={t.id}
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
            {t.completion_notes ? ` · ${t.completion_notes}` : ""}
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => approve(t.id)}
          disabled={approving === t.id}
          className="shrink-0"
        >
          {approving === t.id ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Approve
        </Button>
      </div>
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
          <div className="space-y-2">{proposals.map(row)}</div>
        </div>
      )}

      {completions.length > 0 && (
        <div>
          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-amber-700">
            Nurse completions ({completions.length})
          </p>
          <div className="space-y-2">{completions.map(row)}</div>
        </div>
      )}
    </section>
  );
}
