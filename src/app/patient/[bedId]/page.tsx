import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { PatientWindow } from "@/components/patient-window";
import { getRole } from "@/lib/server/role";
import {
  getPatientByBed,
  getLatestConfirmedNote,
} from "@/lib/server/patient-window-data";
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

  // RBAC: only serialise the record body when the role may see it. Non-doctors
  // get null here and must break-glass (audited) to load it.
  const note = role === "doctor" ? await getLatestConfirmedNote(patient.id) : null;
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

      <PatientWindow patient={patient} role={role} note={note} />
    </main>
  );
}
