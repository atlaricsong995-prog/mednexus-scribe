// Server-only ward data fetch for the nurse / control-tower / doctor boards.
// Uses the service-role client (consistent with the demo's no-auth-session
// architecture) to load the patient lookup + current tasks for a ward.
import { createAdminClient } from "@/lib/supabase/admin";
import type { Task } from "@/lib/supabase/types";
import type { PatientLite } from "@/lib/tasks";

export async function getWardData(
  ward: string,
): Promise<{ patients: PatientLite[]; tasks: Task[] }> {
  const supabase = createAdminClient();
  const [
    { data: patients, error: patientsErr },
    { data: tasks, error: tasksErr },
  ] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, bed_number")
      .eq("ward", ward)
      .eq("active", true)
      .order("bed_number"),
    supabase
      .from("tasks")
      .select("*")
      // Grid cells (routine vitals + MAR give-times) live only in the patient
      // window — keep the ad-hoc worklist / control tower / approvals feed clean.
      // MO-proposed medications carry a med_key too (for the med-keyed safety
      // nets) but are worklist items, not MAR cells — without this exception the
      // attending's approval queue loses them on every page load (they only ever
      // appeared via realtime while the page happened to be open).
      // Safety exceptions always pierce (f8fc764 doctrine): an override-dispensed
      // allergy drug's MAR cells must reach the head nurse's critical banner on a
      // fresh page load too, not only via realtime while the tower happened to be
      // open. Clients still hide them from flat lists via isGridCell.
      .is("routine_key", null)
      .or("med_key.is.null,proposed_by_mo.is.true,safety_alert.not.is.null")
      .eq("ward", ward)
      .order("created_at", { ascending: false }),
  ]);

  // Don't swallow a query failure into an empty board — that once looked like data
  // loss when a migration (006: tasks.routine_key) hadn't been applied yet. Log it
  // loudly so a missing column / RLS issue is diagnosable, not silent.
  if (patientsErr) {
    console.error(`[ward-data] patients query failed: ${patientsErr.message}`);
  }
  if (tasksErr) {
    console.error(`[ward-data] tasks query failed: ${tasksErr.message}`);
  }

  return { patients: (patients as PatientLite[]) ?? [], tasks: tasks ?? [] };
}
