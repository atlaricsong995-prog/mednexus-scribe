"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  TriangleAlert,
  RadioTower,
  Radio,
  Activity,
  BedDouble,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useRealtimeTasks } from "@/hooks/use-realtime";
import type { Task } from "@/lib/supabase/types";
import {
  bedStatusColor,
  buildPatientMap,
  isActive,
  isRoutine,
  STATUS_LABEL,
  type PatientLite,
} from "@/lib/tasks";

interface FeedEntry {
  key: string;
  at: string;
  message: string;
  tone: "dispatch" | "submit" | "approve";
}

const BED_COLOR: Record<"red" | "amber" | "green", string> = {
  red: "border-red-300 bg-red-50",
  amber: "border-amber-300 bg-amber-50",
  green: "border-emerald-200 bg-white",
};
const DOT_COLOR: Record<"red" | "amber" | "green", string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
};

function nowLabel(): string {
  return timeLabel(new Date());
}

function timeLabel(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// Derive a feed tone/verb from a task's current status — used to BACKFILL the
// feed from tasks that already existed when the head nurse opened the page (the
// live channel only delivers events that happen after subscription, so without
// this the feed sits empty whenever the action happened before they looked).
function seedEntry(
  task: Task,
  patientMap: Map<string, PatientLite>,
): FeedEntry {
  const p = patientMap.get(task.patient_id);
  const bed = p ? ` · Bed ${p.bed_number}` : "";
  let tone: FeedEntry["tone"] = "dispatch";
  let verb = "Dispatched";
  let when = task.created_at;
  if (task.status === "approved") {
    tone = "approve";
    verb = "Doctor approved";
    when = task.approved_at ?? task.created_at;
  } else if (task.status === "submitted") {
    tone = "submit";
    verb = `Nurse submitted${task.completion_value ? ` (${task.completion_value})` : ""}${
      task.abnormal ? " ⚠ ABNORMAL" : ""
    }`;
    when = task.submitted_at ?? task.created_at;
  }
  return {
    key: `seed-${task.id}`,
    at: timeLabel(when),
    message: `${verb}: ${task.description}${bed}`,
    tone,
  };
}

// Control Tower (Tech Spec §5.4) — read-only head-nurse dashboard: ward grid of
// beds (status-coloured by outstanding tasks), a live event feed, and a critical
// alert banner. Driven entirely by the realtime tasks channel.
export function ControlTowerBoard({
  ward,
  initialTasks,
  patients,
}: {
  ward: string;
  initialTasks: Task[];
  patients: PatientLite[];
}) {
  const patientMap = useMemo(() => buildPatientMap(patients), [patients]);
  // Backfill the feed from tasks already on the board so it isn't blank when the
  // head nurse opens the page after the action; live events append on top.
  const [feed, setFeed] = useState<FeedEntry[]>(() =>
    [...initialTasks]
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
      .slice(0, 30)
      .map((t) => seedEntry(t, patientMap)),
  );

  const pushFeed = (task: Task, tone: FeedEntry["tone"], verb: string) => {
    const p = patientMap.get(task.patient_id);
    setFeed((prev) =>
      [
        {
          key: `${task.id}-${tone}-${Date.now()}`,
          at: nowLabel(),
          message: `${verb}: ${task.description}${
            p ? ` · Bed ${p.bed_number}` : ""
          }`,
          tone,
        },
        ...prev,
      ].slice(0, 30),
    );
  };

  const { tasks: allTasks, status } = useRealtimeTasks(ward, {
    initialTasks,
    // Routine timetable cells ride the same channel — exclude them from the feed.
    onInsert: (task) => {
      if (isRoutine(task)) return;
      pushFeed(task, "dispatch", "Dispatched");
    },
    onUpdate: (task) => {
      if (isRoutine(task)) return;
      if (task.status === "submitted")
        pushFeed(
          task,
          "submit",
          `Nurse submitted${task.completion_value ? ` (${task.completion_value})` : ""}${
            task.abnormal ? " ⚠ ABNORMAL" : ""
          }`,
        );
      else if (task.status === "approved") pushFeed(task, "approve", "Doctor approved");
    },
  });

  const tasks = useMemo(() => allTasks.filter((t) => !isRoutine(t)), [allTasks]);

  const tasksByPatient = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const arr = m.get(t.patient_id) ?? [];
      arr.push(t);
      m.set(t.patient_id, arr);
    }
    return m;
  }, [tasks]);

  // Outstanding tasks that need head-nurse attention: critical priority, a
  // doctor safety override (allergy drug given against a critical flag), or an
  // abnormal recorded vital (Enh Day 1).
  const criticalActive = tasks.filter(
    (t) =>
      isActive(t.status) &&
      (t.priority === "critical" || !!t.safety_alert || t.abnormal),
  );
  const live = status === "subscribed";

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      {criticalActive.length > 0 && (
        <div className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-4">
          <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="space-y-1">
            <p className="font-semibold text-red-800">
              {criticalActive.length} critical / override task
              {criticalActive.length === 1 ? "" : "s"} outstanding
            </p>
            <ul className="space-y-0.5 text-sm text-red-700">
              {criticalActive.map((t) => {
                const p = patientMap.get(t.patient_id);
                return (
                  <li key={t.id}>
                    {p ? `Bed ${p.bed_number} · ` : ""}
                    {t.description} — {STATUS_LABEL[t.status]}
                    {t.safety_alert ? " ⚠ override" : ""}
                    {t.abnormal
                      ? ` ⚠ abnormal${t.completion_value ? ` (${t.completion_value})` : ""}`
                      : ""}
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* Ward grid */}
        <div>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-400">
            <BedDouble className="h-4 w-4" /> Ward grid
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {patients.map((p) => {
              const ptasks = tasksByPatient.get(p.id) ?? [];
              const activeCount = ptasks.filter((t) => isActive(t.status)).length;
              const color = bedStatusColor(ptasks);
              return (
                <Link
                  key={p.id}
                  href={`/patient/${encodeURIComponent(p.bed_number)}`}
                  className={cn(
                    "block rounded-xl border p-3 transition-all hover:shadow-md hover:ring-1 hover:ring-slate-300",
                    BED_COLOR[color],
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-slate-900">
                      Bed {p.bed_number}
                    </span>
                    <span className={cn("h-2.5 w-2.5 rounded-full", DOT_COLOR[color])} />
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-600">
                    {p.full_name}
                  </p>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {activeCount} active task{activeCount === 1 ? "" : "s"}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Live feed */}
        <div>
          <h2 className="mb-3 flex items-center justify-between text-sm font-medium uppercase tracking-wide text-slate-400">
            <span className="flex items-center gap-1.5">
              <Activity className="h-4 w-4" /> Live feed
            </span>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium normal-case",
                live
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500",
              )}
            >
              {live ? (
                <RadioTower className="h-3 w-3" />
              ) : (
                <Radio className="h-3 w-3" />
              )}
              {live ? "Live" : status}
            </span>
          </h2>
          <div className="max-h-[28rem] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
            {feed.length === 0 ? (
              <p className="py-6 text-center text-xs text-slate-400">
                Waiting for task events…
              </p>
            ) : (
              feed.map((e) => (
                <div key={e.key} className="flex gap-2 text-xs">
                  <span className="shrink-0 tabular-nums text-slate-400">
                    {e.at}
                  </span>
                  <span
                    className={cn(
                      "h-fit shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      e.tone === "dispatch" && "bg-sky-100 text-sky-700",
                      e.tone === "submit" && "bg-amber-100 text-amber-800",
                      e.tone === "approve" && "bg-emerald-100 text-emerald-700",
                    )}
                  >
                    {e.tone}
                  </span>
                  <span className="text-slate-700">{e.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
