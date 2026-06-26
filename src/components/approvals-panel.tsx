"use client";

import { useMemo, useState } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useRealtimeTasks } from "@/hooks/use-realtime";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@/lib/supabase/types";
import { buildPatientMap, type PatientLite } from "@/lib/tasks";

// ApprovalsPanel (Task 5.6) — doctor's live notification of nurse-submitted
// tasks awaiting approval. Toasts on each new submission; [Approve] calls PATCH
// /api/tasks/[id]/approve which closes the loop (realtime then drops it here and
// flips it to approved on the nurse + control-tower boards).
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

  const { tasks } = useRealtimeTasks(ward, {
    initialTasks,
    onUpdate: (task, prev) => {
      if (task.status === "submitted" && prev.status !== "submitted") {
        const p = patientMap.get(task.patient_id);
        toast({
          title: "Task ready for approval",
          description: `${p ? `Bed ${p.bed_number} · ` : ""}${task.description}${
            task.completion_value ? ` — ${task.completion_value}` : ""
          }`,
        });
      }
    },
  });

  const pending = tasks.filter((t) => t.status === "submitted");
  if (pending.length === 0) return null;

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

  return (
    <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-800">
        <BellRing className="h-4 w-4" />
        {pending.length} task{pending.length === 1 ? "" : "s"} awaiting your
        approval
      </h2>
      <div className="space-y-2">
        {pending.map((t) => {
          const p = patientMap.get(t.patient_id);
          return (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-amber-200 bg-white p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-900">
                  {t.description}
                </p>
                <p className="text-xs text-slate-500">
                  {p ? `Bed ${p.bed_number} · ${p.full_name}` : "—"}
                  {t.completion_value ? ` · ${t.completion_value}` : ""}
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
        })}
      </div>
    </section>
  );
}
