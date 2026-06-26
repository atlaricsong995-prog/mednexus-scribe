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
  const [{ data: patients }, { data: tasks }] = await Promise.all([
    supabase
      .from("patients")
      .select("id, full_name, bed_number")
      .eq("ward", ward)
      .eq("active", true)
      .order("bed_number"),
    supabase
      .from("tasks")
      .select("*")
      .eq("ward", ward)
      .order("created_at", { ascending: false }),
  ]);

  return { patients: (patients as PatientLite[]) ?? [], tasks: tasks ?? [] };
}
