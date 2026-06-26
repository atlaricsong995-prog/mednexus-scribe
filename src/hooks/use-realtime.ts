"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import type { Task } from "@/lib/supabase/types";

// useRealtimeTasks(ward) — subscribes to INSERT/UPDATE on the tasks table for a
// ward and keeps a live in-memory list (Tech Spec §2.3, channel `tasks:ward=…`).
//
// Day 4 plumbing: the nurse + control-tower UIs land in Day 5, but this hook +
// the channel are wired now so the realtime path is testable in DevTools (Task
// 4.7). Subscribes with the anon browser client; delivery relies on the demo
// SELECT policy added in migration 002 (Realtime honours RLS).
//
// Writes never happen here — tasks are created server-side by /api/dispatch.

export type RealtimeStatus = "connecting" | "subscribed" | "error" | "closed";

interface UseRealtimeTasksResult {
  tasks: Task[];
  status: RealtimeStatus;
  /** Bumps on every received change event — handy for the DevTools test. */
  eventCount: number;
}

export function useRealtimeTasks(
  ward: string,
  { initialTasks = [], debug = false }: { initialTasks?: Task[]; debug?: boolean } = {},
): UseRealtimeTasksResult {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [eventCount, setEventCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`tasks:ward=${ward}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "tasks",
          filter: `ward=eq.${ward}`,
        },
        (payload) => {
          const t0 = performance.now();
          setEventCount((n) => n + 1);

          if (payload.eventType === "INSERT") {
            const row = payload.new as Task;
            setTasks((prev) =>
              prev.some((x) => x.id === row.id) ? prev : [row, ...prev],
            );
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Task;
            setTasks((prev) => prev.map((x) => (x.id === row.id ? row : x)));
          } else if (payload.eventType === "DELETE") {
            const old = payload.old as Partial<Task>;
            setTasks((prev) => prev.filter((x) => x.id !== old.id));
          }

          if (debug) {
            // eslint-disable-next-line no-console
            console.log(
              `[realtime] tasks ${payload.eventType} (ward=${ward}) +${(
                performance.now() - t0
              ).toFixed(1)}ms`,
              payload.new ?? payload.old,
            );
          }
        },
      )
      .subscribe((s) => {
        if (s === "SUBSCRIBED") setStatus("subscribed");
        else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") setStatus("error");
        else if (s === "CLOSED") setStatus("closed");
        if (debug) {
          // eslint-disable-next-line no-console
          console.log(`[realtime] channel tasks:ward=${ward} → ${s}`);
        }
      });

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [ward, debug]);

  return { tasks, status, eventCount };
}
