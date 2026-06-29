"use client";

import { useMemo } from "react";
import { ClipboardList, RadioTower, Radio } from "lucide-react";

import { TaskCard } from "@/components/task-card";
import { useRealtimeTasks } from "@/hooks/use-realtime";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Task, TaskPriority, TaskStatus } from "@/lib/supabase/types";
import { buildPatientMap, isActive, isGridCell, type PatientLite } from "@/lib/tasks";

const PRIORITY_RANK: Record<TaskPriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};
const STATUS_RANK: Record<TaskStatus, number> = {
  pending: 0,
  in_progress: 0,
  submitted: 1,
  approved: 2,
  rejected: 2,
};

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (STATUS_RANK[a.status] !== STATUS_RANK[b.status])
      return STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (PRIORITY_RANK[a.priority] !== PRIORITY_RANK[b.priority])
      return PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    return (a.scheduled_for ?? a.created_at).localeCompare(
      b.scheduled_for ?? b.created_at,
    );
  });
}

// NurseBoard (Tasks 5.1 + 5.4) — live task list for the ward. Seeded with
// server-fetched tasks, kept in sync by the realtime channel, with a toast when
// a doctor dispatches a new task.
export function NurseBoard({
  ward,
  initialTasks,
  patients,
}: {
  ward: string;
  initialTasks: Task[];
  patients: PatientLite[];
}) {
  const { toast } = useToast();
  const patientMap = useMemo(() => buildPatientMap(patients), [patients]);

  const { tasks: allTasks, status } = useRealtimeTasks(ward, {
    initialTasks,
    onInsert: (task) => {
      // Routine timetable cells (materialised when a patient window opens) ride the
      // same channel — don't surface them on the ad-hoc board.
      if (isGridCell(task)) return;
      const p = patientMap.get(task.patient_id);
      toast({
        title:
          task.priority === "critical"
            ? "🔴 New critical task"
            : "New task dispatched",
        description: `${p ? `Bed ${p.bed_number} · ` : ""}${task.description}`,
      });
    },
  });

  const tasks = useMemo(() => allTasks.filter((t) => !isGridCell(t)), [allTasks]);
  const sorted = useMemo(() => sortTasks(tasks), [tasks]);
  const openCount = tasks.filter((t) => isActive(t.status)).length;
  const live = status === "subscribed";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {openCount} active · {tasks.length} total
        </p>
        <span
          className={cn(
            "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            live
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-slate-200 bg-white text-slate-500",
          )}
        >
          {live ? (
            <RadioTower className="h-3.5 w-3.5" />
          ) : (
            <Radio className="h-3.5 w-3.5" />
          )}
          {live ? "Live" : status}
        </span>
      </div>

      {sorted.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 py-16 text-center">
          <ClipboardList className="h-8 w-8 text-slate-300" />
          <p className="text-sm text-slate-500">
            No tasks yet. New tasks appear here the moment a doctor confirms a
            note.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {sorted.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              patient={patientMap.get(task.patient_id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
