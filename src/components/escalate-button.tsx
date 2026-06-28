"use client";

import { useState } from "react";
import { BellRing, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { escalateToAttending } from "@/app/patient/actions";
import { useToast } from "@/hooks/use-toast";

// Escalate-to-attending button (Enh Day 4, plan point 4). Shown on the Special
// Instructions panel for nurses and residents. One tap writes an audit_log
// 'escalation' row, which the attending's /doctor inbox picks up in realtime. This
// replaces the old "treat the page as a completable task" workaround.
export function EscalateButton({
  patientId,
  bedNumber,
}: {
  patientId: string;
  bedNumber: string;
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function escalate() {
    setSending(true);
    try {
      const res = await escalateToAttending(
        patientId,
        `Escalation from Bed ${bedNumber}`,
      );
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

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={escalate}
      disabled={sending || done}
      className="border-red-300 text-red-700 hover:bg-red-50"
    >
      {sending ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <BellRing className="h-4 w-4" />
      )}
      {done ? "Attending notified" : "Escalate to attending"}
    </Button>
  );
}
