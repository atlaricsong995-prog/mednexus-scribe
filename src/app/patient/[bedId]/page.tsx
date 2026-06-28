import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { getRole } from "@/lib/server/role";
import {
  getPatientByBed,
  getLatestConfirmedNote,
  getRecordHistory,
} from "@/lib/server/patient-window-data";
import {
  ensureTodayRoutine,
  getTodayRoutineTasks,
} from "@/lib/server/routine";
import type { NurseTask } from "@/lib/supabase/types";
import { WARD } from "@/lib/constants";

export const dynamic = "force-dynamic";

const BACK: Record<string, { href: string; label: string }> = {
  doctor: { href: "/doctor", label: "Ward round" },
  nurse: { href: "/nurse", label: "My tasks" },
  head_nurse: { href: "/control-tower", label: "Control tower" },
  mo: { href: "/mo", label: "My patients" },
};

export default async function PatientWindowPage({
  params,
}: {
  params: { bedId: string };
}) {
  const role = getRole();
  const patient = await getPatientByBed(
    WARD,
    decodeURIComponent(params.bedId),
  );
  if (!patient) notFound();

  // Materialise today's routine vitals for this patient (idempotent), then load
  // them for the timetable grid. Visible to every role.
  await ensureTodayRoutine(patient.id, patient.ward);

  // The current confirmed note: needed unmasked for the doctor's record body +
  // history, and (for all roles) to derive the operational "watch-for" list. The
  // record body / history are only passed through when the role may see them; the
  // watch-for tasks are operational and shown to everyone.
  const [currentNote, routineTasks] = await Promise.all([
    getLatestConfirmedNote(patient.id),
    getTodayRoutineTasks(patient.id),
  ]);

  const showRecord = role === "doctor";
  const note = showRecord ? currentNote : null;
  const history = showRecord ? await getRecordHistory(patient.id) : [];

  const watchFor: NurseTask[] =
    currentNote?.nurse_tasks.filter(
      (t) => t.conditions || t.priority === "high" || t.priority === "critical",
    ) ?? [];

  const back = BACK[role ?? ""] ?? { href: "/", label: "Home" };

  return (
    <main className="mx-auto min-h-screen w-full max-w-2xl px-4 py-8">
      <Link
        href={back.href}
        className="mb-6 inline-flex items-center gap-1 text-sm text-slate-500 underline-offset-4 hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        {back.label}
      </Link>

      <PatientWindow
        patient={patient}
        role={role}
        note={note}
        history={history}
        watchFor={watchFor}
        routineTasks={routineTasks}
      />
    </main>
  );
}
