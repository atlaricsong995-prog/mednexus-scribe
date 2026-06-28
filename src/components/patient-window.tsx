// Patient window (Enh Day 2) — the unified 3-section view shared across roles:
//   1. Medical Record   — RBAC-masked (doctor sees it; others break-glass)
//   2. Routine Timetable — today's vitals grid (placeholder until Day 3)
//   3. Special Instructions — conditional "watch-for" orders (display-only)
//
// Server component: when the role can't view the record we render LockedRecord
// and never serialise the note body to the client (RBAC enforced server-side).
import {
  TriangleAlert,
  BedDouble,
  CalendarDays,
  FileText,
  CalendarClock,
  ClipboardList,
  Lock,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { MedicalRecordBody } from "@/components/medical-record-body";
import { RecordHistory } from "@/components/record-history";
import { LockedRecord } from "@/components/locked-record";
import { RoutineTimetable } from "@/components/routine-timetable";
import { EscalateButton } from "@/components/escalate-button";
import { ProposeOrderPanel } from "@/components/propose-order-panel";
import { canViewRecord } from "@/lib/server/role";
import type {
  ClinicalNote,
  NurseTask,
  Patient,
  Role,
  Task,
} from "@/lib/supabase/types";

const ROLE_LABEL: Record<string, string> = {
  nurse: "a nurse",
  mo: "a medical officer",
  head_nurse: "the head nurse",
  patient: "a patient",
};

export function PatientWindow({
  patient,
  role,
  note,
  history = [],
  watchFor = [],
  routineTasks = [],
}: {
  patient: Patient;
  role: Role | null;
  note: ClinicalNote | null;
  // Archived versions for the record timeline (doctor view / break-glass only).
  history?: ClinicalNote[];
  // Conditional / high-priority "watch-for" orders — operational, shown to all
  // roles even when the record narrative is masked (computed server-side).
  watchFor?: NurseTask[];
  // Today's routine vitals cells for the timetable grid.
  routineTasks?: Task[];
}) {
  const allergies = patient.allergies ?? [];
  const showRecord = canViewRecord(role);
  const canEscalate =
    role === "nurse" || role === "mo" || role === "head_nurse";
  const patientLite = {
    id: patient.id,
    full_name: patient.full_name,
    bed_number: patient.bed_number,
  };

  return (
    <div className="space-y-4">
      {/* Identity header — always visible (you must know who + allergies) */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-900 text-base font-bold text-slate-50">
              {patient.bed_number}
            </span>
            <div>
              <CardTitle className="text-xl">{patient.full_name}</CardTitle>
              <p className="text-sm text-slate-500">
                {patient.age ? `${patient.age}y` : "—"}
                {patient.gender ? ` · ${patient.gender}` : ""} · {patient.mrn}
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <BedDouble className="h-4 w-4" /> {patient.ward}
            </span>
            {patient.admission_date && (
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" /> Admitted{" "}
                {patient.admission_date}
              </span>
            )}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Diagnosis
            </p>
            <p className="text-slate-700">
              {patient.diagnosis ?? "No diagnosis recorded"}
            </p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
              Allergies
            </p>
            {allergies.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <TriangleAlert className="h-4 w-4 text-amber-600" />
                {allergies.map((a) => (
                  <span
                    key={a}
                    className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-medium text-amber-700"
                  >
                    {a}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-slate-500">No known allergies (NKDA)</p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section 1 — Medical record (RBAC) */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            {showRecord ? (
              <FileText className="h-4 w-4 text-slate-500" />
            ) : (
              <Lock className="h-4 w-4 text-slate-500" />
            )}
            Medical record
          </CardTitle>
        </CardHeader>
        <CardContent>
          {showRecord ? (
            <div className="space-y-4">
              <MedicalRecordBody note={note} />
              <RecordHistory notes={history} />
            </div>
          ) : (
            <LockedRecord
              patientId={patient.id}
              roleLabel={ROLE_LABEL[role ?? "patient"] ?? "a staff member"}
            />
          )}
        </CardContent>
      </Card>

      {/* Section 2 — Routine timetable (Enh Day 3) */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <CalendarClock className="h-4 w-4 text-slate-500" /> Routine timetable
          </CardTitle>
        </CardHeader>
        <CardContent>
          <RoutineTimetable patient={patientLite} routineTasks={routineTasks} />
        </CardContent>
      </Card>

      {/* MO-only — propose an order to the attending (Enh Day 4) */}
      {role === "mo" && <ProposeOrderPanel patientId={patient.id} />}

      {/* Section 3 — Special instructions (display-only + escalate) */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <ClipboardList className="h-4 w-4 text-slate-500" /> Special
              instructions
              <span className="text-sm font-normal text-slate-400">
                ({watchFor.length})
              </span>
            </CardTitle>
            {canEscalate && (
              <EscalateButton
                patientId={patient.id}
                bedNumber={patient.bed_number}
              />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {watchFor.length === 0 ? (
            <p className="text-sm text-slate-500">
              No standing instructions or watch-for orders.
            </p>
          ) : (
            watchFor.map((t, i) => (
              <div
                key={i}
                className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-sm"
              >
                <p className="font-medium text-slate-800">{t.task}</p>
                {t.conditions && (
                  <p className="mt-0.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Watch for: {t.conditions}
                  </p>
                )}
                {t.when && (
                  <p className="mt-0.5 text-xs text-slate-500">{t.when}</p>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
