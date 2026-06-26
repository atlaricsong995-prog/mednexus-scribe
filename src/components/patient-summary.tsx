import { TriangleAlert, BedDouble, CalendarDays } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { Patient } from "@/lib/supabase/types";

export function PatientSummary({ patient }: { patient: Patient }) {
  const allergies = patient.allergies ?? [];

  return (
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
  );
}
