"use client";

import { useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/client";
import { isGridCell } from "@/lib/tasks";
import type { Task } from "@/lib/supabase/types";

// useRealtimeTasks(ward) — subscribes to INSERT/UPDATE on the tasks table for a
// ward and keeps a live in-memory list (Tech Spec §2.3, channel `tasks:ward=…`).
//
// Powers the nurse board, control tower, and doctor approval feed (Day 5). Seed
// the list with server-fetched rows via `initialTasks`; realtime events merge on
// top. Optional onInsert/onUpdate callbacks fire for toasts + the live feed.
// Subscribes with the anon browser client; delivery relies on the demo SELECT
// policy from migration 002 (Realtime honours RLS).
//
// Writes never happen here — tasks change via the server-side task API routes.

export type RealtimeStatus = "connecting" | "subscribed" | "error" | "closed";

interface UseRealtimeTasksOptions {
  initialTasks?: Task[];
  debug?: boolean;
  onInsert?: (task: Task) => void;
  onUpdate?: (task: Task, prev: Partial<Task>) => void;
}

interface UseRealtimeTasksResult {
  tasks: Task[];
  status: RealtimeStatus;
  /** Bumps on every received change event — handy for the DevTools test. */
  eventCount: number;
}

export function useRealtimeTasks(
  ward: string,
  {
    initialTasks = [],
    debug = false,
    onInsert,
    onUpdate,
  }: UseRealtimeTasksOptions = {},
): UseRealtimeTasksResult {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [status, setStatus] = useState<RealtimeStatus>("connecting");
  const [eventCount, setEventCount] = useState(0);
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Keep latest callbacks in refs so they don't force a resubscribe.
  const cbRef = useRef({ onInsert, onUpdate });
  cbRef.current = { onInsert, onUpdate };

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
            cbRef.current.onInsert?.(row);
          } else if (payload.eventType === "UPDATE") {
            const row = payload.new as Task;
            setTasks((prev) => prev.map((x) => (x.id === row.id ? row : x)));
            cbRef.current.onUpdate?.(row, payload.old as Partial<Task>);
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
        if (s === "SUBSCRIBED") {
          setStatus("subscribed");
          // Re-sync from the DB every time the channel comes up. initialTasks
          // are a server render that Next's client router cache can replay up to
          // ~30s stale after a back-navigation — and any change that happened
          // before the subscription was live never arrives as an event. Both
          // leave zombies (e.g. an approved task still showing "awaiting
          // approval"). Snapshot the same ad-hoc scope the pages fetch
          // (ward-data.ts) and reconcile.
          const snapshotAt = new Date().toISOString();
          void supabase
            .from("tasks")
            .select("*")
            .eq("ward", ward)
            .is("routine_key", null)
            .is("med_key", null)
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              if (!data || channelRef.current !== channel) return;
              const fresh = data as Task[];
              const freshIds = new Set(fresh.map((t) => t.id));
              setTasks((prev) => [
                // Keep rows the snapshot can't judge: grid cells (outside its
                // scope) and inserts that raced the query. Ad-hoc rows missing
                // from the snapshot were changed/removed server-side — drop
                // their stale copy in favour of `fresh`.
                ...prev.filter(
                  (t) =>
                    !freshIds.has(t.id) &&
                    (isGridCell(t) || t.created_at > snapshotAt),
                ),
                ...fresh,
              ]);
            });
        } else if (s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          setStatus("error");
        } else if (s === "CLOSED") {
          setStatus("closed");
        }
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
