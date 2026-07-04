// Pure watch-for (Special Instructions) aggregation — extracted from
// patient-window-data so the discontinue exclusion is testable without a
// Supabase client (2026-07-04 discontinue spec). Notes must be ordered
// newest-first (current note, then archived history): the first occurrence of
// a task key wins the dedup, so the discontinue comparison always runs against
// the NEWEST note carrying that order.
import { isGridSpecialInstruction } from "./obs-routing.ts";
import type { ClinicalNote, NurseTask } from "../supabase/types";

// The aggregation dedup key doubles as the instruction's identity for
// discontinue events — instructions have no row id (they are aggregated
// across notes), so the normalised task text is the stable key.
export function instructionKey(task: string): string {
  return task.trim().toLowerCase();
}

// One instruction_discontinued audit_log row, reduced to what exclusion needs.
export interface DiscontinueEvent {
  task_key: string;
  created_at: string;
}

type WatchForNote = Pick<ClinicalNote, "nurse_tasks" | "confirmed_at">;

// Standing/special instructions carry FORWARD across note confirmations, so a
// key is hidden only while its latest discontinue postdates the newest note
// carrying it — a later re-order (fresher confirmed_at) revives the
// instruction. New order beats old stop, same supersede semantics as meds.
export function computeWatchFor(
  notes: ReadonlyArray<WatchForNote | null>,
  discontinued: ReadonlyArray<DiscontinueEvent> = [],
): NurseTask[] {
  const stoppedAt = new Map<string, number>();
  for (const d of discontinued) {
    const at = Date.parse(d.created_at);
    if (!Number.isFinite(at)) continue;
    const prev = stoppedAt.get(d.task_key);
    if (prev === undefined || at > prev) stoppedAt.set(d.task_key, at);
  }

  // Suppressed grid-vital orders (e.g. a normal-priority "SpO₂ Q2H") get no
  // task row, so Special Instructions is their ONLY home — admit them
  // regardless of priority (same rule the inline aggregation had).
  const qualifies = (t: NurseTask) =>
    !!t.conditions ||
    t.priority === "high" ||
    t.priority === "critical" ||
    isGridSpecialInstruction(t);

  const watchFor: NurseTask[] = [];
  const seen = new Set<string>();
  for (const n of notes) {
    for (const t of n?.nurse_tasks ?? []) {
      if (!qualifies(t)) continue;
      const key = instructionKey(t.task);
      if (seen.has(key)) continue;
      // Claimed by its newest occurrence even when hidden — an older note's
      // copy must not resurrect an order discontinued after the newest one.
      seen.add(key);
      const stopped = stoppedAt.get(key);
      const orderedAt = n?.confirmed_at ? Date.parse(n.confirmed_at) : 0;
      if (stopped !== undefined && stopped > orderedAt) continue;
      watchFor.push(t);
    }
  }
  return watchFor;
}
