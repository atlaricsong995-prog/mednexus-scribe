"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  TriangleAlert,
  RadioTower,
  Radio,
  Activity,
  Users,
  ChevronRight,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useRealtimeTasks } from "@/hooks/use-realtime";
import { DEMO_DOCTOR_NAME, DEMO_NURSE_NAME } from "@/lib/constants";
import type { Task } from "@/lib/supabase/types";
import {
  bedStatusColor,
  buildPatientMap,
  isActive,
  isGridCell,
  STATUS_LABEL,
  type PatientLite,
} from "@/lib/tasks";

const DOT_COLOR: Record<"red" | "amber" | "green", string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
};

interface FeedEntry {
  key: string;
  at: string;
  message: string;
  tone: "dispatch" | "submit" | "approve";
}

function timeLabel(d: Date | string): string {
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

// A dispatched drug fans out into one MAR cell per give-time slot, but the feed
// should narrate it as ONE event ("dispatched Augmentin"), so dedupe per drug
// per note rather than per slot.
function medFeedKey(task: Task): string {
  return `${task.note_id ?? "none"}::${task.med_key}`;
}

// Grid cells that must pierce the isGridCell filter for the head nurse's safety
// surfaces (critical banner + bed colour): an override-dispensed allergy drug,
// a critical-priority cell, or a vital charted abnormal. Ordinary grid cells
// stay hidden — they are timetable scaffolding, not events.
function isSafetyGridCell(task: Task): boolean {
  return (
    isGridCell(task) &&
    isActive(task.status) &&
    (task.priority === "critical" || !!task.safety_alert || task.abnormal)
  );
}

function seedEntry(task: Task, patientMap: Map<string, PatientLite>): FeedEntry {
  const p = patientMap.get(task.patient_id);
  const bed = p ? ` · Bed ${p.bed_number}` : "";
  let tone: FeedEntry["tone"] = "dispatch";
  let verb = `${DEMO_DOCTOR_NAME} dispatched`;
  let when = task.created_at;
  if (task.status === "approved") {
    tone = "approve";
    verb = `${DEMO_DOCTOR_NAME} approved`;
    when = task.approved_at ?? task.created_at;
  } else if (task.status === "submitted") {
    tone = "submit";
    // Name the charting nurse (stamped on submit) instead of a generic "Nurse".
    verb = `${task.completed_by_name ?? DEMO_NURSE_NAME} submitted${
      task.completion_value ? ` (${task.completion_value})` : ""
    }${task.abnormal ? " ⚠ ABNORMAL" : ""}`;
    when = task.submitted_at ?? task.created_at;
  }
  return {
    key: `seed-${task.id}`,
    at: timeLabel(when),
    message: `${verb}: ${task.description}${task.safety_alert ? " ⚠ override" : ""}${bed}`,
    tone,
  };
}

// WardWorklist (問題 2, 決定 A) — the shared master-detail shell for the nurse,
// head nurse, and MO: a live left-hand patient list (status-coloured by outstanding
// ad-hoc tasks) and a right pane that shows the selected patient's detail
// (server-rendered <PatientWindow>, passed as `children`). Selection is by URL
// (?bed=) so the detail loads lazily per patient. For the head nurse, `showActivity`
// adds the critical banner + live event feed (the control-tower dashboard).
export function WardWorklist({
  ward,
  patients,
  initialTasks,
  selectedBed,
  basePath,
  showActivity = false,
  emptyHint,
  children,
}: {
  ward: string;
  patients: PatientLite[];
  initialTasks: Task[];
  selectedBed: string | null;
  basePath: string;
  showActivity?: boolean;
  emptyHint?: string;
  children?: ReactNode;
}) {
  const patientMap = useMemo(() => buildPatientMap(patients), [patients]);

  const [feed, setFeed] = useState<FeedEntry[]>(() => {
    if (!showActivity) return [];
    // Med cells ride into the feed as one entry per drug; routine timetable
    // cells stay out (daily scaffolding, not doctor actions).
    const seenMeds = new Set<string>();
    return [...initialTasks]
      .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
      .filter((t) => {
        if (!isGridCell(t)) return true;
        if (t.med_key == null) return false;
        const key = medFeedKey(t);
        if (seenMeds.has(key)) return false;
        seenMeds.add(key);
        return true;
      })
      .slice(0, 30)
      .map((t) => seedEntry(t, patientMap));
  });

  // Drugs already announced on the feed (seeded or live) — a page opened
  // mid-dispatch must not log the same drug twice when its remaining slot
  // cells arrive over realtime.
  const announcedMeds = useRef<Set<string>>(
    new Set(
      initialTasks.filter((t) => t.med_key != null).map((t) => medFeedKey(t)),
    ),
  );

  const pushFeed = (task: Task, tone: FeedEntry["tone"], verb: string) => {
    const p = patientMap.get(task.patient_id);
    setFeed((prev) =>
      [
        {
          key: `${task.id}-${tone}-${Date.now()}`,
          at: timeLabel(new Date()),
          message: `${verb}: ${task.description}${task.safety_alert ? " ⚠ override" : ""}${p ? ` · Bed ${p.bed_number}` : ""}`,
          tone,
        },
        ...prev,
      ].slice(0, 30),
    );
  };

  const { tasks: allTasks, status } = useRealtimeTasks(ward, {
    initialTasks,
    onInsert: (task) => {
      if (!showActivity) return;
      if (isGridCell(task)) {
        // MAR cells: announce the DRUG once, not every give-time slot; routine
        // timetable cells never hit the feed.
        if (task.med_key == null) return;
        const key = medFeedKey(task);
        if (announcedMeds.current.has(key)) return;
        announcedMeds.current.add(key);
      }
      pushFeed(task, "dispatch", `${DEMO_DOCTOR_NAME} dispatched`);
    },
    onUpdate: (task) => {
      if (!showActivity || isGridCell(task)) return;
      if (task.status === "submitted")
        pushFeed(
          task,
          "submit",
          `${task.completed_by_name ?? DEMO_NURSE_NAME} submitted${
            task.completion_value ? ` (${task.completion_value})` : ""
          }${task.abnormal ? " ⚠ ABNORMAL" : ""}`,
        );
      else if (task.status === "approved")
        pushFeed(task, "approve", `${DEMO_DOCTOR_NAME} approved`);
    },
  });

  const tasks = useMemo(() => allTasks.filter((t) => !isGridCell(t)), [allTasks]);
  const tasksByPatient = useMemo(() => {
    const m = new Map<string, Task[]>();
    for (const t of tasks) {
      const arr = m.get(t.patient_id) ?? [];
      arr.push(t);
      m.set(t.patient_id, arr);
    }
    return m;
  }, [tasks]);

  // Safety exceptions pierce the grid filter: an override-dispensed allergy drug
  // (or abnormal-charted vital) lives on the MAR/timetable, yet the head nurse
  // must still see it on the banner and bed colour. Deduped per drug so a
  // three-slot Augmentin row is one banner line, not three.
  const safetyGrid = useMemo(() => {
    const seen = new Set<string>();
    return allTasks.filter((t) => {
      if (!isSafetyGridCell(t)) return false;
      const key = t.med_key != null ? medFeedKey(t) : t.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [allTasks]);

  const criticalActive = [
    ...tasks.filter(
      (t) =>
        isActive(t.status) &&
        (t.priority === "critical" || !!t.safety_alert || t.abnormal),
    ),
    ...safetyGrid,
  ];
  const live = status === "subscribed";

  return (
    <div className="space-y-4">
      {showActivity && criticalActive.length > 0 && (
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

      <div className="grid gap-4 lg:grid-cols-[18rem_1fr]">
        {/* Left — patient list */}
        <div>
          <h2 className="mb-3 flex items-center justify-between text-sm font-medium uppercase tracking-wide text-slate-400">
            <span className="flex items-center gap-1.5">
              <Users className="h-4 w-4" /> Patients
            </span>
            <span
              className={cn(
                "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium normal-case",
                live ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500",
              )}
            >
              {live ? <RadioTower className="h-3 w-3" /> : <Radio className="h-3 w-3" />}
              {live ? "Live" : status}
            </span>
          </h2>
          <div className="stagger-fade space-y-2">
            {patients.map((p) => {
              const ptasks = tasksByPatient.get(p.id) ?? [];
              const activeCount = ptasks.filter((t) => isActive(t.status)).length;
              // Safety grid cells colour the bed red but stay out of the active
              // count — outstanding scheduled meds are normal ward state, an
              // override drug is not.
              const color = bedStatusColor([
                ...ptasks,
                ...safetyGrid.filter((t) => t.patient_id === p.id),
              ]);
              const sel = selectedBed === p.bed_number;
              return (
                <Link
                  key={p.id}
                  // Toggle: tapping the open patient again clears the selection and
                  // returns the head nurse to the live feed (and collapses the
                  // detail pane for nurse/MO).
                  href={
                    sel
                      ? basePath
                      : `${basePath}?bed=${encodeURIComponent(p.bed_number)}`
                  }
                  prefetch={false}
                  scroll={false}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all hover:shadow-sm",
                    sel
                      ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900"
                      : "border-slate-200 bg-white hover:border-slate-300",
                  )}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-xs font-bold text-slate-50">
                    {p.bed_number}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {p.full_name}
                    </p>
                    <p className="flex items-center gap-1.5 text-xs text-slate-500">
                      <span className={cn("h-2 w-2 rounded-full", DOT_COLOR[color])} />
                      {activeCount} active task{activeCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <ChevronRight
                    className={cn(
                      "h-4 w-4 shrink-0",
                      sel ? "text-slate-900" : "text-slate-300",
                    )}
                  />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right — selected patient detail, or feed (head nurse) / hint */}
        <div className="min-w-0">
          {selectedBed && children ? (
            children
          ) : showActivity ? (
            <div>
              <h2 className="mb-3 flex items-center gap-1.5 text-sm font-medium uppercase tracking-wide text-slate-400">
                <Activity className="h-4 w-4" /> Live feed
              </h2>
              <div className="max-h-[32rem] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
                {feed.length === 0 ? (
                  <p className="py-6 text-center text-xs text-slate-400">
                    Waiting for task events…
                  </p>
                ) : (
                  feed.map((e) => (
                    <div key={e.key} className="flex gap-2 text-xs">
                      <span className="shrink-0 tabular-nums text-slate-400">{e.at}</span>
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
          ) : (
            <div className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-200 text-center">
              <Users className="h-8 w-8 text-slate-300" />
              <p className="max-w-xs text-sm text-slate-500">
                {emptyHint ?? "Select a patient on the left to open their record."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
