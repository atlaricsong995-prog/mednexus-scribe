import Link from "next/link";
import { Stethoscope } from "lucide-react";

import { PatientCard } from "@/components/patient-card";
import { ApprovalsPanel } from "@/components/approvals-panel";
import { BreakGlassListener } from "@/components/break-glass-listener";
import { createClient } from "@/lib/supabase/server";
import { getWardData } from "@/lib/server/ward-data";
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

  // Live approvals feed (submitted nurse tasks) — see ApprovalsPanel.
  const { patients: patientLites, tasks } = await getWardData(WARD);

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-slate-50">
            <Stethoscope className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Doctor · 主治醫生
            </p>
            <h1 className="text-2xl font-bold text-slate-900">
              Today&apos;s Ward Round
            </h1>
            <p className="text-sm text-slate-500">
              {WARD} · {patients?.length ?? 0} patients
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

      <BreakGlassListener patients={patientLites} />

      <ApprovalsPanel
        ward={WARD}
        initialTasks={tasks}
        patients={patientLites}
      />

      {error && (
        <p className="rounded-md bg-red-50 px-4 py-3 text-sm text-red-700">
          Could not load patients: {error.message}
        </p>
      )}

      {patients && patients.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => (
            <PatientCard key={patient.id} patient={patient} />
          ))}
        </div>
      ) : (
        !error && (
          <p className="text-sm text-slate-500">
            No active patients in {WARD}.
          </p>
        )
      )}
    </main>
  );
}
