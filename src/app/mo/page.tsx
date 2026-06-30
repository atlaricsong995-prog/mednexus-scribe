import Link from "next/link";
import { UserCog } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { WardWorklist } from "@/components/ward-worklist";
import { DoctorAlerts } from "@/components/doctor-alerts";
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
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-slate-50">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Medical Officer · Resident
            </p>
            <h1 className="text-2xl font-bold text-slate-900">My Patients</h1>
            <p className="text-sm text-slate-500">
              {WARD} · {patients.length} patients · propose orders, escalate
            </p>
          </div>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm text-slate-500 underline-offset-4 hover:underline"
        >
          ← Switch role
        </Link>
      </header>

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
    </main>
  );
}
