import Link from "next/link";
import { UserCog, ChevronRight, TriangleAlert, FolderOpen } from "lucide-react";

import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { WARD } from "@/lib/constants";
import type { Patient } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

// Resident (MO) port (Enh Day 4). A resident sees the ward patient list and opens
// each into the role-aware patient window (timetable + special instructions
// readable; record masked → break-glass; propose-order + escalate available). The
// MO cannot dictate or issue orders directly — only propose them.
export default async function MoPage() {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("patients")
    .select("*")
    .eq("ward", WARD)
    .eq("active", true)
    .order("bed_number");
  const patients = (data as Patient[]) ?? [];

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl px-4 py-8">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-900 text-slate-50">
            <UserCog className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-slate-400">
              Medical Officer · 駐院醫生
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

      {patients.length === 0 ? (
        <p className="text-sm text-slate-500">No active patients in {WARD}.</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {patients.map((patient) => {
            const allergies = patient.allergies ?? [];
            return (
              <Link
                key={patient.id}
                href={`/patient/${encodeURIComponent(patient.bed_number)}`}
                className="group block focus:outline-none"
              >
                <Card className="h-full border-slate-200 transition-all group-hover:border-slate-900 group-hover:shadow-md">
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
                          {patient.gender ? ` · ${patient.gender}` : ""} ·{" "}
                          {patient.mrn}
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
                    <p className="flex items-center gap-1.5 text-xs text-slate-400">
                      <FolderOpen className="h-3.5 w-3.5" />
                      Open patient window
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
