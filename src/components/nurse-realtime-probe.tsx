"use client";

import { Radio, RadioTower } from "lucide-react";

import { useRealtimeTasks } from "@/hooks/use-realtime";
import { cn } from "@/lib/utils";

// Day 4 realtime probe — the real nurse task UI lands in Day 5. For now this
// just opens the `tasks:ward=…` channel (debug=true logs every event to the
// console) so the dispatch → realtime path is verifiable in DevTools (Task 4.7).
export function NurseRealtimeProbe({ ward }: { ward: string }) {
  const { status, eventCount } = useRealtimeTasks(ward, { debug: true });

  const live = status === "subscribed";

  return (
    <div className="mt-6 flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-500">
      {live ? (
        <RadioTower className="h-3.5 w-3.5 text-emerald-600" />
      ) : (
        <Radio className="h-3.5 w-3.5 text-slate-400" />
      )}
      <span
        className={cn(
          "font-medium",
          live ? "text-emerald-700" : "text-slate-500",
        )}
      >
        Realtime {status}
      </span>
      <span className="text-slate-300">·</span>
      <span className="tabular-nums">{eventCount} events</span>
    </div>
  );
}
