"use client";

import { useState } from "react";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { useToast } from "@/hooks/use-toast";

// Demo reset control (landing page). Wipes the tester's run and restores Ward 5A
// to its seeded baseline via POST /api/admin/reset. Two-click confirm so a stray
// tap doesn't blow away a demo mid-walkthrough.
export function ResetDemoButton() {
  const { toast } = useToast();
  const [arming, setArming] = useState(false);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Reset failed.");
      toast({
        title: "Demo reset to baseline",
        description: `${data.seeded?.length ?? 0} records restored · alerts cleared. Refresh any open role tab.`,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Reset failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setBusy(false);
      setArming(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-1.5">
      <Button
        variant={arming ? "destructive" : "outline"}
        size="sm"
        disabled={busy}
        onClick={() => (arming ? run() : setArming(true))}
        onBlur={() => setArming(false)}
      >
        {busy ? (
          <PulseLoader className="text-current" />
        ) : (
          <RotateCcw className="h-4 w-4" />
        )}
        {busy
          ? "Resetting…"
          : arming
            ? "Click again to confirm reset"
            : "Reset demo data"}
      </Button>
      <p className="text-xs text-slate-400">
        Restores all 6 beds to baseline and clears test tasks, notes &amp; alerts.
      </p>
    </div>
  );
}
