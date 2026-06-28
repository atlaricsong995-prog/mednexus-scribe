"use client";

import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { CompletionDialog } from "@/components/completion-dialog";
import { cn } from "@/lib/utils";
import {
  DEFAULT_ROUTINE,
  OBSERVATION_CATALOG,
  routineKey,
  todayRoutineSlots,
} from "@/lib/clinical/vocab";
import type { Task } from "@/lib/supabase/types";
import type { PatientLite } from "@/lib/tasks";

// Routine timetable grid (Enh Day 3, plan point 3). Rows = the default vitals set,
// columns = today's q4h slots. Each cell is a materialised routine task: filled
// cells show the charted value (red if abnormal), empty cells open the same
// CompletionDialog the nurse board uses (fixed-unit input from the catalog). A
// completion routes straight to recorded (no doctor approval) — see complete route.
export function RoutineTimetable({
  patient,
  routineTasks,
}: {
  patient: PatientLite;
  routineTasks: Task[];
}) {
  const router = useRouter();
  const slots = todayRoutineSlots();

  // Index cells by `${routine_key}|${slot hour}` for O(1) lookup.
  const byCell = new Map<string, Task>();
  for (const t of routineTasks) {
    if (!t.routine_key || !t.scheduled_for) continue;
    byCell.set(`${t.routine_key}|${new Date(t.scheduled_for).getHours()}`, t);
  }

  const nowHour = new Date().getHours();

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              Vital
            </th>
            {slots.map((s) => (
              <th
                key={s.hour}
                className={cn(
                  "px-1 py-1 text-center text-xs font-medium tabular-nums",
                  s.hour <= nowHour ? "text-slate-500" : "text-slate-300",
                )}
              >
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DEFAULT_ROUTINE.map((obs) => {
            const spec = OBSERVATION_CATALOG[obs];
            const key = routineKey(obs);
            return (
              <tr key={obs}>
                <td className="whitespace-nowrap px-2 py-1 text-xs font-medium text-slate-600">
                  {spec.label}
                  <span className="ml-1 text-slate-400">({spec.unit})</span>
                </td>
                {slots.map((s) => {
                  const task = byCell.get(`${key}|${s.hour}`);
                  const filled = task && task.completion_value;
                  return (
                    <td key={s.hour} className="p-0">
                      {task ? (
                        <CompletionDialog
                          task={task}
                          patient={patient}
                          onCompleted={() => router.refresh()}
                          trigger={
                            <button
                              type="button"
                              className={cn(
                                "flex h-9 w-full min-w-[3.5rem] items-center justify-center rounded-md border text-xs font-medium tabular-nums transition-colors",
                                filled
                                  ? task.abnormal
                                    ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                  : "border-dashed border-slate-200 bg-white text-slate-300 hover:border-slate-400 hover:text-slate-500",
                              )}
                              title={
                                filled
                                  ? `${task.completion_value}${task.abnormal ? " — abnormal" : ""}`
                                  : `Chart ${spec.label} at ${s.label}`
                              }
                            >
                              {filled ? (
                                stripUnit(task.completion_value as string)
                              ) : (
                                <Plus className="h-3.5 w-3.5" />
                              )}
                            </button>
                          }
                        />
                      ) : (
                        <div className="flex h-9 w-full min-w-[3.5rem] items-center justify-center rounded-md border border-dashed border-slate-100 bg-slate-50 text-slate-200">
                          —
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 px-1 text-xs text-slate-400">
        Today&apos;s routine vitals (q4h). Tap a cell to chart a reading — abnormal
        values turn red.
      </p>
    </div>
  );
}

// The stored value carries its unit (e.g. "200/120 mmHg"); the grid cell is tight,
// so show just the number(s).
function stripUnit(value: string): string {
  const m = value.match(/^[\d./]+/);
  return m ? m[0] : value;
}
