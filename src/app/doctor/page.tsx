import { Stethoscope, LayoutDashboard } from "lucide-react";

import { PatientCard } from "@/components/patient-card";
import { ApprovalsPanel } from "@/components/approvals-panel";
import { DoctorAlerts } from "@/components/doctor-alerts";
import { AppShell } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";
import { getWardData } from "@/lib/server/ward-data";
import { getRecentAlerts } from "@/lib/server/alerts-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DoctorPage() {
  const supabase = createClient();
  const { data: patients, error } = await supabase
    .from("patients")
    .select("*")
    .eq("ward", WARD)
    .eq("active", true)
    .order("bed_number");

  // Live approvals feed (submitted nurse tasks + MO proposals) — see ApprovalsPanel.
  // Plus the break-glass / escalation alert inbox backfill (DoctorAlerts).
  const [{ patients: patientLites, tasks }, initialAlerts] = await Promise.all([
    getWardData(WARD),
    getRecentAlerts(),
  ]);

  return (
    <AppShell
      roleLabel="Doctor · Attending Physician"
      title="Today's Ward Round"
      subtitle={`${WARD} · ${patients?.length ?? 0} patients`}
      icon={Stethoscope}
      navItems={[
        { label: "Ward Round", href: "/doctor", icon: LayoutDashboard, active: true },
      ]}
    >
      <DoctorAlerts patients={patientLites} initialAlerts={initialAlerts} />

      <ApprovalsPanel ward={WARD} initialTasks={tasks} patients={patientLites} />

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load patients: {error.message}
        </p>
      )}

      {patients && patients.length > 0 ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      ) : (
        !error && (
          <p className="text-sm text-muted-foreground">
            No active patients in {WARD}.
          </p>
        )
      )}
    </AppShell>
  );
}
