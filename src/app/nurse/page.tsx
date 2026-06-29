import Link from "next/link";
import { ClipboardList } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { WardWorklist } from "@/components/ward-worklist";
import { getRole } from "@/lib/server/role";
import { getWardData } from "@/lib/server/ward-data";
import { getPatientWindowData } from "@/lib/server/patient-window-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NursePage({
  searchParams,
}: {
  searchParams: { bed?: string };
}) {
  const role = getRole();
  const { patients, tasks } = await getWardData(WARD);
  const bed = searchParams.bed ?? null;

  const data = bed ? await getPatientWindowData(WARD, bed, role) : null;

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-slate-50">
            <ClipboardList className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Nurse · 護士
            </p>
            <h1 className="text-2xl font-bold text-slate-900">My Ward</h1>
            <p className="text-sm text-slate-500">{WARD}</p>
          </div>
        </div>
        <Link
          href="/"
          className="shrink-0 text-sm text-slate-500 underline-offset-4 hover:underline"
        >
          ← Switch role
        </Link>
      </header>

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
    </main>
  );
}
