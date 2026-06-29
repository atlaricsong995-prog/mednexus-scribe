"use client";

import { useState, type ReactNode } from "react";
import { CheckCircle2, Loader2, Pill } from "lucide-react";

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
import { DEMO_NURSE_NAME } from "@/lib/constants";
import type { Task } from "@/lib/supabase/types";

// MedAdministerDialog (問題 2, 決定 B) — a nurse signs a single medication
// administration from a MAR cell. No doctor approval: the give is recorded straight
// away (PATCH /complete → med cells record to 'approved'). The signer is the
// logged-in nurse's identity, stamped server-side — no manual name entry (問題 3, E).
export function MedAdministerDialog({
  task,
  trigger,
  onDone,
  slotLabel,
}: {
  task: Task;
  trigger: ReactNode;
  onDone?: () => void;
  // "08:00" or "PRN" — shown so the nurse knows which give they're signing.
  slotLabel: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "Given", notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record administration.");
      toast({
        title: "Administration recorded",
        description: `${task.description} · ${slotLabel} — signed ${DEMO_NURSE_NAME}`,
      });
      setOpen(false);
      setNotes("");
      onDone?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not record",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-4 w-4 text-slate-500" /> Sign administration
          </DialogTitle>
          <DialogDescription>
            {task.description} · {slotLabel}
          </DialogDescription>
        </DialogHeader>

        {task.safety_alert && (
          <p className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
            ⚠ Allergy / safety override — {task.safety_alert} Verify before giving.
          </p>
        )}

        <div className="space-y-3">
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500">
            Signing as <span className="font-medium text-slate-700">{DEMO_NURSE_NAME}</span> — recorded automatically from your login.
          </p>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes (optional)
            </p>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. given with food"
              autoFocus
            />
          </div>
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
            Mark given
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
