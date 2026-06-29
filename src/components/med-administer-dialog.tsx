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
import type { Task } from "@/lib/supabase/types";

const NURSE_COOKIE = "nurse_name";

// Demo-grade nurse identity: any of the ward's nurses may chart, so we remember
// the signer's name in a (non-httpOnly) cookie and stamp it on each administration.
function readNurseName(): string {
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(new RegExp(`(?:^|; )${NURSE_COOKIE}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) : "";
}

function writeNurseName(name: string) {
  document.cookie = `${NURSE_COOKIE}=${encodeURIComponent(name)}; path=/; max-age=${60 * 60 * 8}; samesite=lax`;
}

// MedAdministerDialog (問題 2, 決定 B) — a nurse signs a single medication
// administration from a MAR cell. No doctor approval: the give is recorded straight
// away with the nurse's signature (PATCH /complete → med cells record to 'approved').
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
  const [name, setName] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Prefill the signer from the cookie when the dialog opens.
  function onOpenChange(next: boolean) {
    if (next) setName(readNurseName());
    setOpen(next);
  }

  async function submit() {
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      writeNurseName(name.trim());
      const res = await fetch(`/api/tasks/${task.id}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value: "Given", notes, nurseName: name.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not record administration.");
      toast({
        title: "Administration recorded",
        description: `${task.description} · ${slotLabel} — signed ${name.trim()}`,
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
    <Dialog open={open} onOpenChange={onOpenChange}>
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
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Your name (signature)
            </p>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Nurse Siti"
              autoFocus
            />
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Notes (optional)
            </p>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. given with food"
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
          <Button onClick={submit} disabled={submitting || !name.trim()}>
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
