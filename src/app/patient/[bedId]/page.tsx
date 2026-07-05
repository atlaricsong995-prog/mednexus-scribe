import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { getRole, parseRole } from "@/lib/server/role";
import { getPatientWindowData } from "@/lib/server/patient-window-data";
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
  searchParams,
}: {
  params: { bedId: string };
  searchParams: { as?: string };
}) {
  // The shared window is told who opened it (?as=<role>, appended by each
  // port's links) so tabs of the same browser keep independent roles; the
  // landing-page cookie is only the fallback for a bare URL visit.
  const role = parseRole(searchParams.as) ?? getRole();
  const data = await getPatientWindowData(
    WARD,
    decodeURIComponent(params.bedId),
    role,
  );
  if (!data) notFound();

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
        patient={data.patient}
        role={role}
        note={data.note}
        history={data.history}
        watchFor={data.watchFor}
        routineTasks={data.routineTasks}
        medTasks={data.medTasks}
        adHocTasks={data.adHocTasks}
      />
    </main>
  );
}
