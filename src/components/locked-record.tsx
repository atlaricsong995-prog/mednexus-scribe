"use client";

import { useState } from "react";
import { Lock, ShieldAlert, Loader2 } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MedicalRecordBody } from "@/components/medical-record-body";
import { RecordHistory } from "@/components/record-history";
import { breakGlassViewRecord } from "@/app/patient/actions";
import { useToast } from "@/hooks/use-toast";
import type { ClinicalNote } from "@/lib/supabase/types";

// Locked medical record (Enh Day 2). For non-doctor roles the record content is
// NOT sent from the server — only this lock placeholder is. "Emergency view"
// requires a reason, which the server action logs to audit_log before returning
// the record. After break-glass the body renders client-side with a visible
// "access logged" banner.
export function LockedRecord({
  patientId,
  roleLabel,
}: {
  patientId: string;
  roleLabel: string;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState<ClinicalNote | null>(null);
  const [history, setHistory] = useState<ClinicalNote[]>([]);
  const [unlocked, setUnlocked] = useState(false);

  async function confirm() {
    if (!reason.trim()) return;
    setSubmitting(true);
    try {
      const res = await breakGlassViewRecord(patientId, reason);
      if (!res.ok) throw new Error(res.error ?? "Break-glass failed.");
      setNote(res.note ?? null);
      setHistory(res.history ?? []);
      setUnlocked(true);
      setOpen(false);
      toast({
        title: "Break-glass access granted",
        description: "Your access has been logged and the attending notified.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not open record",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (unlocked) {
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            <span className="font-semibold">Break-glass access — </span>
            you are viewing a masked record under emergency access. This view is
            recorded in the audit log.
          </span>
        </div>
        <MedicalRecordBody note={note} />
        <RecordHistory notes={history} />
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50 py-8 text-center">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-200 text-slate-500">
          <Lock className="h-5 w-5" />
        </span>
        <div>
          <p className="text-sm font-medium text-slate-700">
            Medical record restricted
          </p>
          <p className="mx-auto mt-0.5 max-w-xs text-xs text-slate-500">
            The full record is visible to the attending doctor. As {roleLabel}{" "}
            you may break the glass in an emergency — your access is logged.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
          <ShieldAlert className="h-4 w-4" />
          Emergency view (break-glass)
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Break-glass access</DialogTitle>
            <DialogDescription>
              You are about to open a restricted medical record. State your
              reason — it will be recorded in the audit log and the attending
              doctor will be notified.
            </DialogDescription>
          </DialogHeader>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Reason for emergency access
            </p>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. patient unresponsive, attending unreachable"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button onClick={confirm} disabled={submitting || !reason.trim()}>
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              Break glass &amp; view
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
