"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

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
import type { Task } from "@/lib/supabase/types";
import type { PatientLite } from "@/lib/tasks";

const textareaCls =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// CompletionDialog (Task 5.2) — nurse records a completion value (e.g. "BSL 6.2
// mmol/L") + optional notes, then submits the task for doctor approval via PATCH
// /api/tasks/[id]/complete. The board updates itself from the realtime UPDATE.
export function CompletionDialog({
  task,
  patient,
}: {
  task: Task;
  patient?: PatientLite;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not submit.");
      toast({
        title: "Task submitted",
        description: "Sent to the doctor for approval.",
      });
      setOpen(false);
      setValue("");
      setNotes("");
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
        <Button size="sm" className="w-full">
          <CheckCircle2 className="h-4 w-4" />
          Mark complete
        </Button>
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
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Result / value
            </p>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. BSL 6.2 mmol/L, BP 128/82, done"
              autoFocus
            />
          </div>
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
          <Button onClick={submit} disabled={submitting}>
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
