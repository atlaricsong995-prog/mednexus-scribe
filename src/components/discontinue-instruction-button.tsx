"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { discontinueInstruction } from "@/app/patient/actions";
import { useToast } from "@/hooks/use-toast";

// Doctor-only stop for one Special Instruction (2026-07-04 spec). Two-step
// confirm on the same button — no dialog, no reason field (user decision: the
// append-only audit row's who+when is the accountability; the armed state only
// guards mis-taps). On success the server-recomputed watch-for list drops the
// row via router.refresh(); re-ordering the instruction later revives it.
export function DiscontinueInstructionButton({
  patientId,
  task,
}: {
  patientId: string;
  task: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [armed, setArmed] = useState(false);
  const [sending, setSending] = useState(false);

  // A forgotten first tap must not fire minutes later — disarm after 4s.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function onClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setSending(true);
    try {
      const res = await discontinueInstruction(patientId, task);
      if (!res.ok) throw new Error(res.error ?? "Discontinue failed.");
      toast({ title: "Instruction discontinued", description: task });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not discontinue",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
      setArmed(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={sending}
      className={
        armed
          ? "h-7 px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
          : "h-7 px-2 text-xs text-slate-500 hover:text-red-700"
      }
    >
      {sending ? (
        <PulseLoader className="text-current" />
      ) : armed ? (
        "Confirm discontinue?"
      ) : (
        "Discontinue"
      )}
    </Button>
  );
}
