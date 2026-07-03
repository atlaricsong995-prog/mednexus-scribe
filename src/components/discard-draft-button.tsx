"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { useToast } from "@/hooks/use-toast";
import { discardDraft } from "@/app/doctor/actions";

// Companion to the restored-draft banner on the bed page: throw the abandoned
// draft away so the recorder comes back for a fresh dictation.
export function DiscardDraftButton({ noteId }: { noteId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function discard() {
    setBusy(true);
    const res = await discardDraft(noteId);
    if (res.ok) {
      toast({
        title: "Draft discarded",
        description: "You can dictate or type a new note.",
      });
      router.refresh();
    } else {
      toast({
        variant: "destructive",
        title: "Could not discard draft",
        description: res.error,
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
