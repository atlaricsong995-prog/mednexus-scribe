import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Patient } from "@/lib/supabase/types";

export function PatientCard({ patient }: { patient: Patient }) {
  const allergies = patient.allergies ?? [];

  return (
    <Link
      href={`/doctor/${patient.bed_number}`}
      className="group block focus:outline-none"
    >
      <Card className="h-full border-slate-200 transition-all group-hover:border-slate-900 group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-slate-900">
        <CardHeader className="flex-row items-start justify-between space-y-0 pb-2">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-slate-900 text-sm font-semibold text-slate-50">
              {patient.bed_number}
            </span>
            <div>
              <p className="font-semibold leading-tight text-slate-900">
                {patient.full_name}
              </p>
              <p className="text-xs text-slate-500">
                {patient.age ? `${patient.age}y` : "—"}
                {patient.gender ? ` · ${patient.gender}` : ""} · {patient.mrn}
              </p>
            </div>
          </div>
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300 transition-colors group-hover:text-slate-900" />
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="line-clamp-2 text-sm text-slate-600">
            {patient.diagnosis ?? "No diagnosis recorded"}
          </p>
          {allergies.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <TriangleAlert className="h-3.5 w-3.5 text-amber-600" />
              {allergies.map((a) => (
                <span
                  key={a}
                  className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700"
                >
                  {a}
                </span>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
