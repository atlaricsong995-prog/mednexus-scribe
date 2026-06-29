// Shared task display helpers for the nurse board, control tower, and doctor
// approval feed (Day 5). Pure data — safe to import from client or server.
import type { Task, TaskPriority, TaskStatus } from "@/lib/supabase/types";

// Minimal patient shape carried alongside tasks so realtime-inserted rows (which
// only contain the tasks columns) can still resolve bed + name from a lookup.
export interface PatientLite {
  id: string;
  full_name: string;
  bed_number: string;
}

export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

export const STATUS_LABEL: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  submitted: "Awaiting approval",
  approved: "Approved",
  rejected: "Rejected",
};

export const STATUS_BADGE: Record<TaskStatus, string> = {
  pending: "bg-slate-100 text-slate-600",
  in_progress: "bg-sky-100 text-sky-700",
  submitted: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

// "Active" = still in the workflow (not yet closed by approval/rejection).
export function isActive(status: TaskStatus): boolean {
  return status === "pending" || status === "in_progress" || status === "submitted";
}

// Routine-timetable cell (Enh Day 3) — lives only in the patient-window grid, so
// the ad-hoc boards (nurse / control tower / approvals) filter these out.
export function isRoutine(task: Task): boolean {
  return task.routine_key != null;
}

// Materialised MAR cell (問題 2) — a per-slot medication administration, lives only
// in the patient-window give-time grid (mirrors routine cells).
export function isMedCell(task: Task): boolean {
  return task.med_key != null;
}

// Any timetable grid cell (routine vitals OR MAR give-times). The ad-hoc boards
// exclude all of these — they belong to the patient-window grids, not the flat feed.
export function isGridCell(task: Task): boolean {
  return task.routine_key != null || task.med_key != null;
}

export function isOpenForNurse(status: TaskStatus): boolean {
  return status === "pending" || status === "in_progress";
}

// A resident-proposed order still awaiting the attending's authorisation: tagged
// proposed_by_mo and not yet carried out by a nurse (completed_by null). This is the
// ONE submitted state approval should AUTHORISE into a live order (→ pending) rather
// than CLOSE (→ approved). Once the nurse completes it (completed_by set) it is a
// normal completion awaiting sign-off, even though proposed_by_mo stays true for
// provenance. Discriminating on completed_by — not completion_value — is the fix:
// an action/med completion legitimately carries no measured value yet must still
// close on approval (otherwise the doctor's approve bounces it back to pending).
export function isUnauthorisedProposal(
  task: Pick<Task, "proposed_by_mo" | "completed_by">,
): boolean {
  return task.proposed_by_mo === true && task.completed_by == null;
}

// Ward-grid bed colour: red if an active task is critical / a safety override /
// an abnormal vital, amber if any task is active, green when nothing outstanding.
export function bedStatusColor(tasks: Task[]): "red" | "amber" | "green" {
  const active = tasks.filter((t) => isActive(t.status));
  if (
    active.some(
      (t) => t.priority === "critical" || !!t.safety_alert || t.abnormal,
    )
  )
    return "red";
  if (active.length > 0) return "amber";
  return "green";
}

export function buildPatientMap(patients: PatientLite[]): Map<string, PatientLite> {
  return new Map(patients.map((p) => [p.id, p]));
}
