"use client";

import { useRouter } from "next/navigation";
import { TriangleAlert, Check } from "lucide-react";

import { MedAdministerDialog } from "@/components/med-administer-dialog";
import { cn } from "@/lib/utils";
import type { Task } from "@/lib/supabase/types";

// Medication administration record (問題 2, 決定 B). Rows = drugs, columns = today's
// give-times for each drug's frequency (materialised at dispatch — see the MAR
// fan-out). Each cell is one scheduled administration; PRN drugs get a trailing
// "PRN" column (no fixed time). A drug with a safety override reads as a red row.
//
// Step 3 renders the grid (display). The tap-to-sign interaction (charting an
// administration + nurse signature) is wired in step 4 via MedAdministerDialog.
interface MedRow {
  medKey: string;
  description: string;
  safetyAlert: string | null;
  byHour: Map<number, Task>;
  prn: Task | null;
}

function hourLabel(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

// A charted administration carries a completion (the nurse signed it). Med cells
// record straight to 'approved' (no doctor sign-off) — see complete route.
function isGiven(task: Task): boolean {
  return task.status === "approved" || task.completion_value != null;
}

export function MedicationTimetable({
  medTasks,
  readOnly = false,
}: {
  medTasks: Task[];
  // Head-nurse view: cells are display-only (no charting).
  readOnly?: boolean;
}) {
  const router = useRouter();
  const rows = new Map<string, MedRow>();
  const hourSet = new Set<number>();
  let hasPrn = false;

  for (const t of medTasks) {
    if (!t.med_key) continue;
    let row = rows.get(t.med_key);
    if (!row) {
      row = {
        medKey: t.med_key,
        description: t.description,
        safetyAlert: t.safety_alert,
        byHour: new Map(),
        prn: null,
      };
      rows.set(t.med_key, row);
    }
    if (t.safety_alert) row.safetyAlert = t.safety_alert;
    if (t.scheduled_for) {
      row.byHour.set(new Date(t.scheduled_for).getHours(), t);
      hourSet.add(new Date(t.scheduled_for).getHours());
    } else {
      row.prn = t;
      hasPrn = true;
    }
  }

  const hours = Array.from(hourSet).sort((a, b) => a - b);
  const rowList = Array.from(rows.values());

  if (rowList.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No medications on this patient&apos;s current orders.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-1 text-sm">
        <thead>
          <tr>
            <th className="px-2 py-1 text-left text-xs font-medium uppercase tracking-wide text-slate-400">
              Medication
            </th>
            {hours.map((h) => (
              <th
                key={h}
                className="px-1 py-1 text-center text-xs font-medium tabular-nums text-slate-500"
              >
                {hourLabel(h)}
              </th>
            ))}
            {hasPrn && (
              <th className="px-1 py-1 text-center text-xs font-medium uppercase tracking-wide text-slate-400">
                PRN
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rowList.map((row) => (
            <tr key={row.medKey}>
              {/* No nowrap here — long orders ("Augmentin 1 g PO TDS for 5 days…")
                  must wrap, or this column forces the whole MAR to side-scroll. */}
              <td
                className={cn(
                  "min-w-[9rem] rounded-md px-2 py-1 text-xs font-medium",
                  row.safetyAlert
                    ? "bg-red-50 text-red-800"
                    : "text-slate-700",
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {row.safetyAlert && (
                    <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-red-600" />
                  )}
                  {row.description}
                </span>
                {row.safetyAlert && (
                  <span className="mt-0.5 block text-[11px] font-normal text-red-600">
                    ⚠ {row.safetyAlert}
                  </span>
                )}
              </td>
              {hours.map((h) => (
                <td key={h} className="p-0">
                  <MedCell
                    task={row.byHour.get(h) ?? null}
                    readOnly={readOnly}
                    slotLabel={hourLabel(h)}
                    onDone={() => router.refresh()}
                  />
                </td>
              ))}
              {hasPrn && (
                <td className="p-0">
                  <MedCell
                    task={row.prn}
                    readOnly={readOnly}
                    prn
                    slotLabel="PRN"
                    onDone={() => router.refresh()}
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 px-1 text-xs text-slate-400">
        Today&apos;s give-times. {readOnly ? "Read-only." : "Tap a slot to chart an administration."}
      </p>
    </div>
  );
}

// A single MAR cell. No task at this hour for this drug → not due (dash). A signed
// administration → green tick + signer. A pending administration → an open slot
// that's tap-to-sign (unless read-only, e.g. the head nurse's view).
function MedCell({
  task,
  readOnly,
  prn = false,
  slotLabel,
  onDone,
}: {
  task: Task | null;
  readOnly: boolean;
  prn?: boolean;
  slotLabel: string;
  onDone?: () => void;
}) {
  if (!task) {
    return (
      <div className="flex h-9 w-full min-w-[3.5rem] items-center justify-center rounded-md border border-dashed border-slate-100 bg-slate-50 text-slate-200">
        —
      </div>
    );
  }
  if (isGiven(task)) {
    return (
      <div
        className="flex h-9 w-full min-w-[3.5rem] flex-col items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700"
        title={`Given${task.completed_by_name ? ` · ${task.completed_by_name}` : ""}`}
      >
        <Check className="h-3.5 w-3.5" />
        {task.completed_by_name && (
          <span className="max-w-[3.5rem] truncate text-[10px] leading-none">
            {task.completed_by_name}
          </span>
        )}
      </div>
    );
  }
  // Pending administration — open slot. Read-only roles see a static box.
  if (readOnly) {
    return (
      <div className="flex h-9 w-full min-w-[3.5rem] items-center justify-center rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-300">
        {prn ? "PRN" : "○"}
      </div>
    );
  }
  return (
    <MedAdministerDialog
      task={task}
      slotLabel={slotLabel}
      onDone={onDone}
      trigger={
        <button
          type="button"
          className="flex h-9 w-full min-w-[3.5rem] items-center justify-center rounded-md border border-dashed border-slate-300 bg-white text-xs font-medium text-slate-400 transition-colors hover:border-slate-900 hover:text-slate-700"
          title={`Sign ${prn ? "PRN dose" : `give at ${slotLabel}`}`}
        >
          {prn ? "PRN" : "○"}
        </button>
      }
    />
  );
}
