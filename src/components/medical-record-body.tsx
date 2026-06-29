// Presentational medical-record body (Enh Day 2). No "use client" — usable from
// the server component (doctor, full view) AND from the client LockedRecord after
// break-glass. Pure rendering of a confirmed clinical note.
import { Pill } from "lucide-react";

import { SurgicalReportButton } from "@/components/surgical-report-button";
import type { ClinicalNote, Medication } from "@/lib/supabase/types";

const NOTE_FIELDS: { key: keyof ClinicalNote["medical_note"]; label: string }[] = [
  { key: "chief_complaint", label: "Chief complaint" },
  { key: "hpi", label: "History of present illness" },
  { key: "exam", label: "Examination" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

function medLine(m: Medication): string {
  const parts = [m.drug, m.dose, m.route, m.frequency]
    .map((p) => p?.trim())
    .filter(Boolean);
  let s = parts.join(" ");
  const dur = m.duration?.trim();
  if (dur && !/^(as charted|stat|n\/?a|-)$/i.test(dur)) s += ` × ${dur}`;
  return s || m.drug;
}

export function MedicalRecordBody({
  note,
  variant = "current",
}: {
  note: ClinicalNote | null;
  // "archived" entries (rendered inside RecordHistory) omit the surgical-report
  // action so the history timeline stays compact.
  variant?: "current" | "archived";
}) {
  if (!note) {
    return (
      <p className="text-sm text-slate-500">
        No clinical note on file yet — this patient is newly admitted. Dictate a
        note to create the first record for this admission.
      </p>
    );
  }

  const confirmed = note.confirmed_at
    ? new Date(note.confirmed_at).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="space-y-4 text-sm">
      {confirmed && (
        <p className="text-xs text-slate-400">Last confirmed {confirmed}</p>
      )}

      {NOTE_FIELDS.map(({ key, label }) => (
        <div key={key}>
          <p className="mb-0.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            {label}
          </p>
          <p className="whitespace-pre-wrap text-slate-700">
            {note.medical_note[key] || "—"}
          </p>
        </div>
      ))}

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
          <Pill className="h-3.5 w-3.5" /> Medications ({note.medications.length})
        </p>
        {note.medications.length === 0 ? (
          <p className="text-slate-500">None.</p>
        ) : (
          <ul className="space-y-1">
            {note.medications.map((m, i) => (
              <li key={i} className="text-slate-700">
                • {medLine(m)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {note.icd10_suggestions && note.icd10_suggestions.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            ICD-10
          </p>
          <div className="flex flex-wrap gap-1.5">
            {note.icd10_suggestions.map((c) => (
              <span
                key={c}
                className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {variant === "current" && (
        <SurgicalReportButton patientNote={note.medical_note.assessment} />
      )}
    </div>
  );
}
