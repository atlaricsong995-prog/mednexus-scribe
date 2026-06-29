// Routine timetable materialisation (Enh Day 3, plan point 3). Server-only,
// service-role (the demo has no auth session). Idempotently expands the default
// standing order (vitals q4h) into TODAY's task rows for a patient, then loads
// them back for the patient-window grid.
//
// Routine cells are tagged with `routine_key` (e.g. 'vitals:bp') so every board
// that shows the ad-hoc feed can exclude them — they live only in the timetable.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_ROUTINE,
  OBSERVATION_CATALOG,
  routineKey,
  todayRoutineSlots,
} from "@/lib/clinical/vocab";
import type { Database, Task } from "@/lib/supabase/types";

type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

function dayBounds(now: Date = new Date()): { start: string; end: string } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

// Ensure today's routine cells exist for a patient. Safe to call on every window
// open AND concurrently: a single upsert with ignoreDuplicates lets the DB's unique
// index (patient_id, routine_key, scheduled_for — migration 008) absorb races. This
// matters because the master-detail prefetches patient links, firing this from
// several requests at once; a read-then-insert raced and produced duplicate cells.
export async function ensureTodayRoutine(
  patientId: string,
  ward: string,
): Promise<void> {
  const supabase = createAdminClient();
  const slots = todayRoutineSlots();

  const rows: TaskInsert[] = [];
  for (const obs of DEFAULT_ROUTINE) {
    const key = routineKey(obs);
    for (const slot of slots) {
      rows.push({
        note_id: null,
        patient_id: patientId,
        ward,
        task_type: "observation",
        description: `${OBSERVATION_CATALOG[obs].label} (routine ${slot.label})`,
        obs_type: obs,
        routine_key: key,
        scheduled_for: slot.iso,
        priority: "normal",
        status: "pending",
      });
    }
  }

  // ignoreDuplicates: existing cells (incl. already-charted ones) are left untouched;
  // only genuinely missing slots are inserted. Concurrent calls can't double-insert.
  await supabase
    .from("tasks")
    .upsert(rows, {
      onConflict: "patient_id,routine_key,scheduled_for",
      ignoreDuplicates: true,
    });
}

// Today's routine cells for a patient, ordered chronologically. Used to render the
// timetable grid (rows = obs type, columns = slot).
export async function getTodayRoutineTasks(
  patientId: string,
): Promise<Task[]> {
  const supabase = createAdminClient();
  const { start, end } = dayBounds();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("patient_id", patientId)
    .not("routine_key", "is", null)
    .gte("scheduled_for", start)
    .lte("scheduled_for", end)
    .order("scheduled_for", { ascending: true });
  return (data as Task[]) ?? [];
}

// MAR cells for a patient (問題 2) — the give-time grid materialised at dispatch.
// No date bound: PRN administrations carry scheduled_for = null, and a re-dispatch
// already supersedes prior pending cells, so this is the current order set.
export async function getTodayMedTasks(patientId: string): Promise<Task[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("patient_id", patientId)
    .not("med_key", "is", null)
    .order("scheduled_for", { ascending: true, nullsFirst: false });
  return (data as Task[]) ?? [];
}
