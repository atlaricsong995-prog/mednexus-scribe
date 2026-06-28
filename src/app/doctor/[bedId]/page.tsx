import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FolderOpen } from "lucide-react";

import { PatientSummary } from "@/components/patient-summary";
import { Recorder } from "@/components/recorder";
import { createClient } from "@/lib/supabase/server";
import { WARD } from "@/lib/constants";
import type { Patient } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

export default async function PatientDetailPage({
  params,
}: {
  params: { bedId: string };
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from("patients")
    .select("*")
    .eq("ward", WARD)
    .eq("bed_number", decodeURIComponent(params.bedId))
    .maybeSingle();

  const patient = data as Patient | null;
  if (!patient) notFound();

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

        <Link
          href={`/patient/${encodeURIComponent(patient.bed_number)}`}
          className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 transition-colors hover:border-slate-900"
        >
          <span className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4" />
            Open full patient window (record · timetable · instructions)
          </span>
          <span className="text-slate-400">→</span>
        </Link>

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
