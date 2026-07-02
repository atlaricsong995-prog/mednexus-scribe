import { UserCog, LayoutDashboard } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { WardWorklist } from "@/components/ward-worklist";
import { DoctorAlerts } from "@/components/doctor-alerts";
import { AppShell } from "@/components/app-shell";
import { getRole } from "@/lib/server/role";
import { getWardData } from "@/lib/server/ward-data";
import { getPatientWindowData } from "@/lib/server/patient-window-data";
import { getRecentAlerts } from "@/lib/server/alerts-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

// Resident (MO) port (Enh Day 4 + 問題 2). Master-detail: left ward list, right the
// role-aware patient window — timetable + special instructions readable, record
// masked → break-glass modal, propose-order + escalate available. The MO cannot
// dictate or issue orders directly — only propose them.
export default async function MoPage({
  searchParams,
}: {
  searchParams: { bed?: string };
}) {
  const role = getRole();
  const bed = searchParams.bed ?? null;

  // Ward data + the escalation/break-glass inbox backfill. Critical-vital
  // auto-escalations reach the MO (first responder) here as well as the attending.
  const [{ patients, tasks }, initialAlerts] = await Promise.all([
    getWardData(WARD),
    getRecentAlerts(),
  ]);

  const data = bed ? await getPatientWindowData(WARD, bed, role) : null;

  return (
    <AppShell
      roleLabel="Medical Officer · Resident"
      title="My Patients"
      subtitle={`${WARD} · ${patients.length} patients · propose orders, escalate`}
      icon={UserCog}
      navItems={[
        { label: "My Patients", href: "/mo", icon: LayoutDashboard, active: true },
      ]}
    >
      <DoctorAlerts patients={patients} initialAlerts={initialAlerts} />

      <WardWorklist
        ward={WARD}
        patients={patients}
        initialTasks={tasks}
        selectedBed={bed}
        basePath="/mo"
        emptyHint="Select a patient to view the timetable, propose an order, or escalate."
      >
        {data && (
          <PatientWindow
            patient={data.patient}
            role={role}
            note={data.note}
            history={data.history}
            watchFor={data.watchFor}
            routineTasks={data.routineTasks}
            medTasks={data.medTasks}
            adHocTasks={data.adHocTasks}
          />
        )}
      </WardWorklist>
    </AppShell>
  );
}
