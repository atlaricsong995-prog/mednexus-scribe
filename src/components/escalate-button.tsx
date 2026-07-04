"use client";

import { useState } from "react";
import { BellRing } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { escalateToAttending } from "@/app/patient/actions";
import { useToast } from "@/hooks/use-toast";

// Escalate-to-attending button (Enh Day 4, plan point 4). Shown on the Special
// Instructions panel for nurses and residents. One tap writes an audit_log
// 'escalation' row, which the attending's /doctor inbox picks up in realtime. This
// replaces the old "treat the page as a completable task" workaround.
// 2026-07-04: per-row usage — `context` carries the instruction text so the
// attending sees WHICH order fired ("Bed 17 — Check wound…"), and `compact`
// renders the icon-size row variant. The panel-level button (no context)
// keeps serving escalations unrelated to any listed instruction.
export function EscalateButton({
  patientId,
  bedNumber,
  context,
  compact = false,
}: {
  patientId: string;
  bedNumber: string;
  context?: string;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function escalate() {
    setSending(true);
    try {
      const message = context
        ? `Bed ${bedNumber} — ${context}`
        : `Escalation from Bed ${bedNumber}`;
      const res = await escalateToAttending(patientId, message);
      if (!res.ok) throw new Error(res.error ?? "Escalation failed.");
      setDone(true);
      toast({
        title: "Attending notified",
        description: "Your escalation was sent to the attending doctor.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not escalate",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSending(false);
    }
  }

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={escalate}
        disabled={sending || done}
        title={done ? "Attending notified" : "Escalate this instruction"}
        className="h-7 px-2 text-red-700 hover:bg-red-50"
      >
        {sending ? (
          <PulseLoader className="text-current" />
        ) : (
          <BellRing className="h-3.5 w-3.5" />
        )}
        {done && <span className="text-xs">Sent</span>}
        <span className="sr-only">Escalate this instruction</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={escalate}
      disabled={sending || done}
      className="border-red-300 text-red-700 hover:bg-red-50"
    >
      {sending ? (
        <PulseLoader className="text-current" />
      ) : (
        <BellRing className="h-4 w-4" />
      )}
      {done ? "Attending notified" : "Escalate to attending"}
    </Button>
  );
}
