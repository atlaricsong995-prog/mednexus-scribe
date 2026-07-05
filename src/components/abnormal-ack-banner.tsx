"use client";

import { useState } from "react";
import { BellRing, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { useToast } from "@/hooks/use-toast";
import type { Task } from "@/lib/supabase/types";

// Abnormal sign-offs carried onto the bed page: the dashboard's "Dictate order →"
// lands here, so the Acknowledge button rides along — the doctor responds AND signs
// off in one place instead of navigating back to the ward round. Same explicit
// PATCH /api/tasks/[id]/approve as the ApprovalsPanel (deliberate, audited); if the
// item was already signed off in another tab the endpoint 409s and we just drop it.
export function AbnormalAckBanner({ initialTasks }: { initialTasks: Task[] }) {
  const { toast } = useToast();
  const [tasks, setTasks] = useState(initialTasks);
  const [acking, setAcking] = useState<string | null>(null);

  async function acknowledge(taskId: string) {
    setAcking(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/approve`, {
        method: "PATCH",
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        // Already acknowledged elsewhere (e.g. the dashboard in another tab).
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        toast({
          title: "Already signed off",
          description: "This value was acknowledged elsewhere.",
        });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Could not acknowledge.");
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast({ title: "Acknowledged", description: "Abnormal value signed off." });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Acknowledge failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setAcking(null);
    }
  }

  if (tasks.length === 0) return null;

  return (
    <section className="rounded-xl border border-red-300 bg-red-50 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-800">
        <BellRing className="h-4 w-4" />
        {tasks.length} abnormal value{tasks.length === 1 ? "" : "s"} awaiting
        your sign-off
      </h2>
      <div className="space-y-2">
        {tasks.map((t) => (
          <div
            key={t.id}
            className="flex items-center justify-between gap-3 rounded-lg border border-red-300 bg-white p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-slate-900">
                {t.description}
              </p>
              <p className="text-xs text-slate-500">
                {t.completed_by_name ? `${t.completed_by_name} · ` : ""}
                {t.completion_value ? (
                  <span className="font-semibold text-red-600">
                    {t.completion_value} ⚠ abnormal
                  </span>
                ) : (
                  "abnormal"
                )}
                {t.completion_notes ? ` · ${t.completion_notes}` : ""}
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => acknowledge(t.id)}
              disabled={acking === t.id}
              className="shrink-0"
            >
              {acking === t.id ? (
                <PulseLoader className="text-current" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Acknowledge
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
