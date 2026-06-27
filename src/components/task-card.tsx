"use client";

import {
  Clock,
  BedDouble,
  CheckCircle2,
  Hourglass,
  AlertTriangle,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { CompletionDialog } from "@/components/completion-dialog";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/supabase/types";
import {
  PRIORITY_BADGE,
  STATUS_BADGE,
  STATUS_LABEL,
  isOpenForNurse,
  type PatientLite,
} from "@/lib/tasks";

function whenLabel(task: Task): string | null {
  if (task.scheduled_for) {
    return new Date(task.scheduled_for).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return null;
}

// TaskCard (Tech Spec §5.3) — priority colour, patient bed, description, and the
// Mark Complete action while the task is open for the nurse.
export function TaskCard({
  task,
  patient,
}: {
  task: Task;
  patient?: PatientLite;
}) {
  const due = whenLabel(task);
  const open = isOpenForNurse(task.status);

  return (
    <Card
      className={cn(
        "border-slate-200",
        task.priority === "critical" && open && "border-red-300 bg-red-50/40",
        // Drug dispatched under a doctor override of a critical safety flag —
        // make the whole card read as a hazard for the nurse.
        task.safety_alert && open && "border-red-400 bg-red-50/60",
      )}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium capitalize",
                PRIORITY_BADGE[task.priority],
              )}
            >
              {task.priority}
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                STATUS_BADGE[task.status],
              )}
            >
              {STATUS_LABEL[task.status]}
            </span>
          </div>
          {patient && (
            <span className="flex shrink-0 items-center gap-1 text-xs text-slate-500">
              <BedDouble className="h-3.5 w-3.5" />
              Bed {patient.bed_number}
            </span>
          )}
        </div>

        <div>
          <p className="font-medium leading-snug text-slate-900">
            {task.description}
          </p>
          {patient && (
            <p className="text-xs text-slate-500">{patient.full_name}</p>
          )}
        </div>

        {task.safety_alert && (
          <div className="flex items-start gap-1.5 rounded-md border border-red-300 bg-red-100 px-2 py-1.5 text-xs font-medium text-red-800">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              <span className="font-semibold">Allergy / safety override — </span>
              {task.safety_alert} Confirmed by doctor; verify before giving.
            </span>
          </div>
        )}

        {(due || task.conditions) && (
          <div className="space-y-1 text-xs text-slate-500">
            {due && (
              <p className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" /> {due}
              </p>
            )}
            {task.conditions && (
              <p className="rounded-md bg-amber-50 px-2 py-1 text-amber-800">
                {task.conditions}
              </p>
            )}
          </div>
        )}

        {open ? (
          <CompletionDialog task={task} patient={patient} />
        ) : task.status === "submitted" ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700">
            <Hourglass className="h-3.5 w-3.5" />
            Awaiting doctor approval
            {task.completion_value ? ` · ${task.completion_value}` : ""}
          </div>
        ) : task.status === "approved" ? (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Approved{task.completion_value ? ` · ${task.completion_value}` : ""}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
