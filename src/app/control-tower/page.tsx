import { LayoutDashboard } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { WardWorklist } from "@/components/ward-worklist";
import { AppShell } from "@/components/app-shell";
import { getRole } from "@/lib/server/role";
import { getWardData } from "@/lib/server/ward-data";
import { getPatientWindowData } from "@/lib/server/patient-window-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function ControlTowerPage({
  searchParams,
}: {
  searchParams: { bed?: string };
}) {
  const role = getRole();
  const { patients, tasks } = await getWardData(WARD);
  const bed = searchParams.bed ?? null;

  const data = bed ? await getPatientWindowData(WARD, bed, role) : null;

  return (
    <AppShell
      roleLabel="Head Nurse · Charge Nurse"
      title="Control Tower"
      subtitle={`${WARD} · ${patients.length} beds · read-only`}
      icon={LayoutDashboard}
      navItems={[
        { label: "Control Tower", href: "/control-tower", icon: LayoutDashboard, active: true },
      ]}
    >
      <WardWorklist
        ward={WARD}
        patients={patients}
        initialTasks={tasks}
        selectedBed={bed}
        basePath="/control-tower"
        showActivity
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
