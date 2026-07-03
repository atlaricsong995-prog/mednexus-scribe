"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { useToast } from "@/hooks/use-toast";
import { discardDraft } from "@/app/doctor/actions";

// Companion to the restored-draft banner on the bed page: throw the abandoned
// draft away so the recorder comes back for a fresh dictation.
export function DiscardDraftButton({ noteId }: { noteId: string }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);

  async function discard() {
    setBusy(true);
    try {
      const res = await discardDraft(noteId);
      if (!res.ok) throw new Error(res.error);
      toast({
        title: "Draft discarded",
        description: "You can dictate or type a new note.",
      });
      // Full reload, not router.refresh(): the RSC refresh request can fail
      // transiently (observed 503 in dev), which would leave the banner up
      // forever. A hard reload always re-renders the bed page draft-free.
      window.location.reload();
    } catch (err) {
      // Surface the failure and re-arm the button — a swallowed rejection here
      // reads as a permanent spinner.
      toast({
        variant: "destructive",
        title: "Could not discard draft",
        description:
          err instanceof Error ? err.message : "Unknown error — try again.",
      });
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={discard} disabled={busy}>
      {busy ? <PulseLoader className="text-current" /> : <Trash2 className="h-4 w-4" />}
      Discard draft
    </Button>
  );
}
