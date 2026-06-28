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
// open: we read the cells already present (by routine_key + slot hour, tolerant of
// timestamp formatting) and insert only the missing ones. The partial unique index
// (migration 006) is a second guard against races.
export async function ensureTodayRoutine(
  patientId: string,
  ward: string,
): Promise<void> {
  const supabase = createAdminClient();
  const { start, end } = dayBounds();
  const slots = todayRoutineSlots();

  const { data: existing } = await supabase
    .from("tasks")
    .select("routine_key, scheduled_for")
    .eq("patient_id", patientId)
    .not("routine_key", "is", null)
    .gte("scheduled_for", start)
    .lte("scheduled_for", end);

  const have = new Set(
    (existing ?? []).map(
      (r) =>
        `${r.routine_key}|${
          r.scheduled_for ? new Date(r.scheduled_for).getHours() : "?"
        }`,
    ),
  );

  const rows: TaskInsert[] = [];
  for (const obs of DEFAULT_ROUTINE) {
    const key = routineKey(obs);
    for (const slot of slots) {
      if (have.has(`${key}|${slot.hour}`)) continue;
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

  if (rows.length > 0) {
    // Ignore a unique-violation from a concurrent open — the cells exist either way.
    await supabase.from("tasks").insert(rows);
  }
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
