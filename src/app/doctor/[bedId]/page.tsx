import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FolderOpen } from "lucide-react";

import { PatientSummary } from "@/components/patient-summary";
import { PatientWindow } from "@/components/patient-window";
import { PatientWindowModal } from "@/components/patient-window-modal";
import { Recorder } from "@/components/recorder";
import { getRole } from "@/lib/server/role";
import { getPatientWindowData } from "@/lib/server/patient-window-data";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({
  params,
}: {
  params: { bedId: string };
}) {
  const role = getRole();
  const data = await getPatientWindowData(
    WARD,
    decodeURIComponent(params.bedId),
    role,
  );
  if (!data) notFound();

  const { patient } = data;

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8">
      <Link
        href="/doctor"
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 underline-offset-4 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Ward round
      </Link>

      <div className="space-y-6">
        <PatientSummary patient={patient} />

        {/* Open the full window in a modal — closing it returns here, not the ward. */}
        <PatientWindowModal
          title={`${patient.full_name} · Bed ${patient.bed_number}`}
          trigger={
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 transition-colors hover:border-slate-900"
            >
              <span className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                Open full patient window (record · MAR · timetable · instructions)
              </span>
              <span className="text-slate-400">→</span>
            </button>
          }
        >
          <PatientWindow
            patient={patient}
            role={role}
            note={data.note}
            history={data.history}
            watchFor={data.watchFor}
            routineTasks={data.routineTasks}
            medTasks={data.medTasks}
            adHocTasks={data.adHocTasks}
          />
        </PatientWindowModal>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-slate-400">
            Dictate note
          </h2>
          <Recorder patientId={patient.id} />
        </section>
      </div>
    </main>
  );
}
