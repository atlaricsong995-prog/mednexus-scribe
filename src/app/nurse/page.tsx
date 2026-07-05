import { ClipboardList, LayoutDashboard } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { WardWorklist } from "@/components/ward-worklist";
import { AppShell } from "@/components/app-shell";
import { getWardData } from "@/lib/server/ward-data";
import { getPatientWindowData } from "@/lib/server/patient-window-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NursePage({
  searchParams,
}: {
  searchParams: { bed?: string };
}) {
  // Route = role: this port is always the ward nurse, regardless of what other
  // windows of the same browser picked on the landing page.
  const role = "nurse" as const;
  const { patients, tasks } = await getWardData(WARD);
  const bed = searchParams.bed ?? null;

  const data = bed ? await getPatientWindowData(WARD, bed, role) : null;

  return (
    <AppShell
      roleLabel="Nurse · Ward Nurse"
      title="My Ward"
      subtitle={WARD}
      icon={ClipboardList}
      navItems={[
        { label: "My Ward", href: "/nurse", icon: LayoutDashboard, active: true },
      ]}
    >
      <WardWorklist
        ward={WARD}
        patients={patients}
        initialTasks={tasks}
        selectedBed={bed}
        basePath="/nurse"
        emptyHint="Select a patient to chart medications (MAR), vitals, and complete tasks."
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
