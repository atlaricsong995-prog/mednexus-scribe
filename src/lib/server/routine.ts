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
  isObsType,
  medKey,
  routineKey,
  todayMedSlots,
  todayRoutineSlots,
} from "@/lib/clinical/vocab";
import { gridObsOrderSlots } from "@/lib/clinical/obs-routing";
import { instructionKey } from "@/lib/clinical/watch-for";
import type { Database, Medication, NurseTask, Task } from "@/lib/supabase/types";

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

// Build a one-line MAR description from a medication (fallback only — re-materialised
// cells normally carry the description forward from the dispatch cell). Mirrors
// medicationDescription in the dispatch route.
function medDescription(m: Medication): string {
  const parts = [m.drug, m.dose, m.route, m.frequency]
    .map((p) => p?.trim())
    .filter(Boolean);
  let desc = parts.join(" ");
  const duration = m.duration?.trim();
  if (duration && !/^(as charted|stat|n\/?a|-)$/i.test(duration)) {
    desc += ` × ${duration}`;
  } else if (!duration && !/\bstat\b|\bonce\b/i.test(m.frequency ?? "")) {
    desc += " · ongoing";
  }
  return desc;
}

// Ensure today's MAR give-time cells exist for a patient's active order set
// (問題 2 cross-day fix). The active orders = medications on the current confirmed
// note. Like ensureTodayRoutine, this is idempotent and concurrency-safe: a single
// upsert with ignoreDuplicates lets the unique index (patient_id, med_key,
// scheduled_for — migration 009) absorb races and leave already-charted cells
// untouched. Without this the grid kept showing the dispatch-day cells forever (and
// a multi-day order produced no give-times for any later day).
export async function ensureTodayMeds(
  patientId: string,
  ward: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: note } = await supabase
    .from("clinical_notes")
    .select("id, medications, confirmed_at")
    .eq("patient_id", patientId)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const meds = ((note?.medications as Medication[] | null) ?? []).filter(
    (m) => m?.drug?.trim(),
  );
  if (!note || meds.length === 0) return;

  // Dispatch only materialises give-times from the confirm moment onward (an
  // order can't have been due before it existed). Mirror that here, or the next
  // window open would resurrect exactly the past slots dispatch skipped. From
  // the day after confirmation, the full day's slots are legitimately due.
  const confirmedAt = note.confirmed_at ? new Date(note.confirmed_at) : null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const minHour =
    confirmedAt && confirmedAt >= startOfToday ? confirmedAt.getHours() : 0;

  // Carry per-drug provenance (description / safety override / priority) forward from
  // any existing cell of that drug, so re-materialised cells keep the red allergy /
  // dose override the dispatch computed (the MAR component reads it off the cell).
  const { data: existing } = await supabase
    .from("tasks")
    .select("med_key, description, safety_alert, priority")
    .eq("patient_id", patientId)
    // MO-proposed orders share a drug's med_key but aren't MAR cells — their
    // description must not become the template for re-materialised give-times.
    .eq("proposed_by_mo", false)
    .not("med_key", "is", null);
  type MedRep = {
    med_key: string | null;
    description: string;
    safety_alert: string | null;
    priority: Task["priority"];
  };
  const byMed = new Map<string, MedRep>();
  for (const c of (existing as MedRep[] | null) ?? []) {
    if (c.med_key && !byMed.has(c.med_key)) byMed.set(c.med_key, c);
  }

  const rows: TaskInsert[] = [];
  for (const m of meds) {
    const key = medKey(m.drug);
    // STAT / once-only orders are one-off events anchored to the hour they were
    // DISPATCHED. medSlotHours derives their slot from "now", so re-materialising
    // on a later window load would mint a fresh pending cell every hour the
    // window is opened — an already-given dose resurrecting as due again. The
    // dispatch-created cell is the whole story; never re-materialise these.
    if (/\bstat\b|\bonce\b/i.test(m.frequency ?? "")) continue;
    const slots = todayMedSlots(m.frequency).filter((s) => s.hour >= minHour);
    // PRN / unknown frequency → charted ad-hoc (no fixed daily slot); the original
    // null-scheduled cell persists, so nothing to materialise here.
    if (slots.length === 0) continue;
    const rep = byMed.get(key);
    for (const slot of slots) {
      rows.push({
        note_id: note.id,
        patient_id: patientId,
        ward,
        task_type: "medication",
        description: rep?.description ?? medDescription(m),
        med_key: key,
        scheduled_for: slot.iso,
        safety_alert: rep?.safety_alert ?? null,
        priority: rep?.priority ?? "normal",
        status: "pending",
      });
    }
  }
  if (rows.length === 0) return;

  await supabase
    .from("tasks")
    .upsert(rows, {
      onConflict: "patient_id,med_key,scheduled_for",
      ignoreDuplicates: true,
    });
}

// Ensure today's cells exist for ORDERED grid observations (2026-07-07 — "BSL QDS"
// charts as a dynamic routine-grid row, the ward's bedside CBG chart). The active
// orders live on the current confirmed note's nurse_tasks. A doctor discontinue
// (audit_log instruction_discontinued) NEWER than that note stops re-materialisation;
// a fresh re-order (newer confirmed_at) revives it — the same new-order-beats-old-stop
// semantics computeWatchFor applies to Special Instructions. Slots follow the same
// "from the confirm moment onward" rule as ensureTodayMeds.
export async function ensureTodayObsOrders(
  patientId: string,
  ward: string,
): Promise<void> {
  const supabase = createAdminClient();

  const { data: note } = await supabase
    .from("clinical_notes")
    .select("id, nurse_tasks, confirmed_at")
    .eq("patient_id", patientId)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nurseTasks = ((note?.nurse_tasks as NurseTask[] | null) ?? []).filter(
    (t) => t?.task?.trim(),
  );
  if (!note || nurseTasks.length === 0) return;

  const confirmedAt = note.confirmed_at ? new Date(note.confirmed_at) : null;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const minHour =
    confirmedAt && confirmedAt >= startOfToday ? confirmedAt.getHours() : 0;
  const orderedAtMs = confirmedAt?.getTime() ?? 0;

  // Latest discontinue per instruction key — a stop newer than the order hides it.
  const { data: stops } = await supabase
    .from("audit_log")
    .select("created_at, metadata")
    .eq("action", "instruction_discontinued")
    .eq("entity_id", patientId);
  const stoppedAt = new Map<string, number>();
  for (const r of (stops ?? []) as {
    created_at: string;
    metadata: { task_key?: string } | null;
  }[]) {
    const k = r.metadata?.task_key;
    const at = Date.parse(r.created_at);
    if (!k || !Number.isFinite(at)) continue;
    const prev = stoppedAt.get(k);
    if (prev === undefined || at > prev) stoppedAt.set(k, at);
  }

  const rows: TaskInsert[] = [];
  for (const t of nurseTasks) {
    const slots = gridObsOrderSlots(t);
    if (!slots || !isObsType(t.obs_type)) continue;
    const stopped = stoppedAt.get(instructionKey(t.task));
    if (stopped !== undefined && stopped > orderedAtMs) continue;
    const spec = OBSERVATION_CATALOG[t.obs_type];
    const rkey = routineKey(t.obs_type);
    for (const slot of slots.filter((s) => s.hour >= minHour)) {
      rows.push({
        note_id: note.id,
        patient_id: patientId,
        ward,
        task_type: "observation",
        description: `${spec.label} (ordered ${slot.label})`,
        obs_type: t.obs_type,
        routine_key: rkey,
        scheduled_for: slot.iso,
        conditions: t.conditions ?? null,
        priority: t.priority ?? "normal",
        status: "pending",
      });
    }
  }
  if (rows.length === 0) return;

  await supabase.from("tasks").upsert(rows, {
    onConflict: "patient_id,routine_key,scheduled_for",
    ignoreDuplicates: true,
  });
}

// Today's MAR cells for a patient (問題 2): today's scheduled give-times PLUS any PRN
// cells (scheduled_for = null — "as needed", no fixed day). Date-scoped like the
// routine grid so yesterday's charted give-times don't bleed into today's heading.
export async function getTodayMedTasks(patientId: string): Promise<Task[]> {
  const supabase = createAdminClient();
  const { start, end } = dayBounds();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("patient_id", patientId)
    .not("med_key", "is", null)
    .or(
      `and(scheduled_for.gte.${start},scheduled_for.lte.${end}),scheduled_for.is.null`,
    )
    .order("scheduled_for", { ascending: true, nullsFirst: false });
  return (data as Task[]) ?? [];
}
