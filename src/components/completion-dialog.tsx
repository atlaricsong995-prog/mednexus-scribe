"use client";

import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, TriangleAlert } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  OBSERVATION_CATALOG,
  isAbnormal,
  isObsType,
} from "@/lib/clinical/vocab";
import type { Task } from "@/lib/supabase/types";
import type { PatientLite } from "@/lib/tasks";

const textareaCls =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// CompletionDialog (Task 5.2) — nurse records a completion value, then submits
// the task for doctor approval via PATCH /api/tasks/[id]/complete. For observation
// tasks (task.obs_type set) the inputs are fixed-unit fields from
// OBSERVATION_CATALOG and the value is range-checked live so an out-of-range vital
// (e.g. BP 200/120) shows a red warning before submit and red on the board after.
export function CompletionDialog({
  task,
  patient,
  trigger,
  onCompleted,
}: {
  task: Task;
  patient?: PatientLite;
  // Custom dialog trigger (e.g. a timetable grid cell). Falls back to the default
  // "Mark complete" button when omitted.
  trigger?: ReactNode;
  // Called after a successful submit — the timetable grid uses it to refresh.
  onCompleted?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [sys, setSys] = useState("");
  const [dia, setDia] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const obs = isObsType(task.obs_type) ? task.obs_type : null;
  const spec = obs ? OBSERVATION_CATALOG[obs] : null;

  // Compose the canonical completion string (with fixed unit) from the inputs.
  const composedValue = useMemo(() => {
    if (!spec) return value.trim();
    if (spec.kind === "bp") {
      if (!sys.trim() && !dia.trim()) return "";
      return `${sys.trim() || "?"}/${dia.trim() || "?"} ${spec.unit}`;
    }
    return value.trim() ? `${value.trim()} ${spec.unit}` : "";
  }, [spec, value, sys, dia]);

  const abnormal = obs ? isAbnormal(obs, composedValue) : false;
  const canSubmit = spec ? composedValue !== "" : true;

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: composedValue, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit.");
      toast({
        title: abnormal ? "⚠ Abnormal value recorded" : "Value recorded",
        description: task.routine_key
          ? "Charted to the routine timetable."
          : "Sent to the doctor for approval.",
      });
      setOpen(false);
      setValue("");
      setSys("");
      setDia("");
      setNotes("");
      onCompleted?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Submit failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" className="w-full">
            <CheckCircle2 className="h-4 w-4" />
            Mark complete
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Complete task</DialogTitle>
          <DialogDescription>
            {patient ? `Bed ${patient.bed_number} · ${patient.full_name} — ` : ""}
            {task.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {spec ? (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                {spec.label} ({spec.unit})
              </p>
              {spec.kind === "bp" ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={sys}
                    onChange={(e) => setSys(e.target.value)}
                    inputMode="decimal"
                    placeholder="Systolic"
                    autoFocus
                  />
                  <span className="text-slate-400">/</span>
                  <Input
                    value={dia}
                    onChange={(e) => setDia(e.target.value)}
                    inputMode="decimal"
                    placeholder="Diastolic"
                  />
                  <span className="shrink-0 text-sm text-slate-500">
                    {spec.unit}
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    inputMode="decimal"
                    step={spec.step}
                    placeholder={spec.placeholder}
                    autoFocus
                  />
                  <span className="shrink-0 text-sm text-slate-500">
                    {spec.unit}
                  </span>
                </div>
              )}
              {abnormal && (
                <p className="mt-1.5 flex items-center gap-1.5 rounded-md bg-red-50 px-2 py-1.5 text-xs font-medium text-red-700">
                  <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
                  Outside normal range
                  {spec.kind === "bp"
                    ? ` (${spec.systolic[0]}–${spec.systolic[1]} / ${spec.diastolic[0]}–${spec.diastolic[1]} ${spec.unit})`
                    : ` (${spec.normal[0]}–${spec.normal[1]} ${spec.unit})`}
                </p>
              )}
            </div>
          ) : (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                Result / value
              </p>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. done, sample sent"
                autoFocus
              />
            </div>
          )}
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes (optional)
            </p>
            <textarea
              className={textareaCls}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the doctor should know"
            />
          </div>
          {task.conditions && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Condition: {task.conditions}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !canSubmit}>
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4" />
            )}
            Submit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
