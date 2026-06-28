"use client";

import { useMemo, useState } from "react";
import {
  FileText,
  Pill,
  ListChecks,
  ShieldAlert,
  ShieldCheck,
  Plus,
  Trash2,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ConfirmButton } from "@/components/confirm-button";
import { cn } from "@/lib/utils";
import { checkMedicationSafety } from "@/lib/safety";
import {
  ROUTE_OPTIONS,
  FREQ_OPTIONS,
  DOSE_UNITS,
  parseDose,
} from "@/lib/clinical/vocab";
import type {
  Medication,
  NurseTask,
  MedicalNote,
  SafetyFlag,
} from "@/lib/supabase/types";

export interface NoteReviewData {
  noteId: string;
  medical_note: MedicalNote;
  medications: Medication[];
  nurse_tasks: NurseTask[];
  icd10_suggestions: string[];
  safety_flags: SafetyFlag[];
  // Patient allergies — lets the panel re-derive D-008 flags live as the doctor
  // edits the medication list (add Augmentin → red box appears on that row).
  allergies: string[];
}

const NOTE_FIELDS: { key: keyof MedicalNote; label: string }[] = [
  { key: "chief_complaint", label: "Chief complaint" },
  { key: "hpi", label: "History of present illness" },
  { key: "exam", label: "Examination" },
  { key: "assessment", label: "Assessment" },
  { key: "plan", label: "Plan" },
];

const PRIORITY_STYLES: Record<NurseTask["priority"], string> = {
  low: "bg-slate-100 text-slate-600",
  normal: "bg-sky-100 text-sky-700",
  high: "bg-amber-100 text-amber-700",
  critical: "bg-red-100 text-red-700",
};

const EMPTY_MED: Medication = {
  drug: "",
  dose: "",
  route: "",
  frequency: "",
  duration: "",
};

const EMPTY_TASK: NurseTask = {
  task: "",
  when: "",
  conditions: null,
  priority: "normal",
  obs_type: null,
};

const textareaCls =
  "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

const selectCls =
  "h-9 w-full rounded-md border border-input bg-white px-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
      {children}
    </p>
  );
}

// Build <option>s from a controlled list, preserving any free-text fallback the
// LLM produced that isn't in the list (so we never silently drop a value).
function optionsWith(list: readonly string[], current: string): string[] {
  const cur = current?.trim();
  if (cur && !list.some((o) => o.toLowerCase() === cur.toLowerCase())) {
    return [cur, ...list];
  }
  return [...list];
}

// Does a safety flag belong to this medication row? flag.drug may be a single
// drug or a "drugA + drugB" duplicate-class pairing — match either part.
function flagMatchesMed(flag: SafetyFlag, med: Medication): boolean {
  const drug = med.drug.toLowerCase().trim();
  if (!drug) return false;
  return flag.drug
    .toLowerCase()
    .split("+")
    .map((p) => p.trim())
    .some((part) => part && (part.includes(drug) || drug.includes(part)));
}

// Day 4 review surface. Note / Meds / Tasks are editable in place. Safety flags
// (D-008) are re-derived live from the edited meds + patient allergies and shown
// INLINE on the offending drug row (Enh Day 1, point 1) — critical = red frame,
// warning = amber badge — with a one-line summary above the list. The Confirm
// button dispatches via /api/dispatch, gated by the override when a critical flag
// is present.
export function NoteReviewPanel({ data }: { data: NoteReviewData }) {
  const [note, setNote] = useState<MedicalNote>(data.medical_note);
  const [meds, setMeds] = useState<Medication[]>(data.medications);
  const [tasks, setTasks] = useState<NurseTask[]>(data.nurse_tasks);

  const updateMed = (i: number, key: keyof Medication, value: string) =>
    setMeds((prev) =>
      prev.map((m, idx) => (idx === i ? { ...m, [key]: value } : m)),
    );
  const updateDose = (i: number, value: string, unit: string) =>
    setMeds((prev) =>
      prev.map((m, idx) =>
        idx === i
          ? { ...m, dose: value.trim() ? `${value.trim()} ${unit}` : "" }
          : m,
      ),
    );
  const addMed = () => setMeds((prev) => [...prev, { ...EMPTY_MED }]);
  const removeMed = (i: number) =>
    setMeds((prev) => prev.filter((_, idx) => idx !== i));

  const updateTask = (i: number, key: keyof NurseTask, value: string) =>
    setTasks((prev) =>
      prev.map((t, idx) =>
        idx === i
          ? {
              ...t,
              [key]:
                key === "conditions" && value === "" ? null : value,
            }
          : t,
      ),
    );
  const addTask = () => setTasks((prev) => [...prev, { ...EMPTY_TASK }]);
  const removeTask = (i: number) =>
    setTasks((prev) => prev.filter((_, idx) => idx !== i));

  // Live D-008 re-derivation. Same deterministic checker the server runs on
  // dispatch, so the inline frames the doctor sees match what gates dispatch.
  const flags = useMemo(
    () => checkMedicationSafety(meds, data.allergies),
    [meds, data.allergies],
  );
  const criticalFlags = flags.filter((f) => f.severity === "critical");
  const warningFlags = flags.filter((f) => f.severity === "warning");

  return (
    <div className="space-y-4">
      {/* Card 1 — Clinical note */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-slate-500" /> Clinical note
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {NOTE_FIELDS.map(({ key, label }) => (
            <div key={key}>
              <FieldLabel>{label}</FieldLabel>
              <textarea
                className={textareaCls}
                rows={key === "hpi" || key === "plan" ? 3 : 2}
                value={note[key]}
                onChange={(e) =>
                  setNote((prev) => ({ ...prev, [key]: e.target.value }))
                }
              />
            </div>
          ))}
          {data.icd10_suggestions.length > 0 && (
            <div>
              <FieldLabel>ICD-10 suggestions</FieldLabel>
              <div className="flex flex-wrap gap-1.5">
                {data.icd10_suggestions.map((code) => (
                  <span
                    key={code}
                    className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600"
                  >
                    {code}
                  </span>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card 2 — Medications (with inline D-008 safety flags) */}
      <Card
        className={cn(
          "border-slate-200",
          criticalFlags.length > 0 && "border-red-200",
        )}
      >
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Pill className="h-4 w-4 text-slate-500" /> Medications
            <span className="text-sm font-normal text-slate-400">
              ({meds.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* One-line safety summary above the list */}
          <div
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm",
              criticalFlags.length > 0
                ? "bg-red-50 text-red-800"
                : warningFlags.length > 0
                  ? "bg-amber-50 text-amber-800"
                  : "bg-emerald-50 text-emerald-700",
            )}
          >
            {criticalFlags.length > 0 || warningFlags.length > 0 ? (
              <ShieldAlert className="h-4 w-4 shrink-0" />
            ) : (
              <ShieldCheck className="h-4 w-4 shrink-0" />
            )}
            <span>
              {criticalFlags.length === 0 && warningFlags.length === 0
                ? "No safety flags — no allergy, dose, or duplicate-class issues."
                : [
                    criticalFlags.length > 0 &&
                      `${criticalFlags.length} critical`,
                    warningFlags.length > 0 && `${warningFlags.length} warning`,
                  ]
                    .filter(Boolean)
                    .join(" · ") + " safety flag(s) — see highlighted rows."}
            </span>
          </div>

          {meds.length === 0 && (
            <p className="text-sm text-slate-500">No medications extracted.</p>
          )}
          {meds.map((m, i) => {
            const rowFlags = flags.filter((f) => flagMatchesMed(f, m));
            const hasCritical = rowFlags.some((f) => f.severity === "critical");
            const hasWarning = rowFlags.some((f) => f.severity === "warning");
            const parsed = parseDose(m.dose);
            const doseValue = parsed ? String(parsed.value) : "";
            const doseUnit = parsed?.unit ?? "mg";
            return (
              <div
                key={i}
                className={cn(
                  "relative space-y-2 rounded-lg border p-3",
                  hasCritical
                    ? "border-red-400 bg-red-50/60"
                    : hasWarning
                      ? "border-amber-300 bg-amber-50/50"
                      : "border-slate-100 bg-slate-50/60",
                )}
              >
                <button
                  type="button"
                  onClick={() => removeMed(i)}
                  aria-label="Remove medication"
                  className="absolute right-1.5 top-1.5 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <div className="col-span-2 sm:col-span-1">
                    <FieldLabel>Drug</FieldLabel>
                    <Input
                      value={m.drug}
                      onChange={(e) => updateMed(i, "drug", e.target.value)}
                      className="bg-white"
                    />
                  </div>
                  <div>
                    <FieldLabel>Dose</FieldLabel>
                    <div className="flex gap-1">
                      <Input
                        value={doseValue}
                        inputMode="decimal"
                        placeholder="1"
                        onChange={(e) =>
                          updateDose(i, e.target.value, doseUnit)
                        }
                        className="bg-white"
                      />
                      <select
                        value={doseUnit}
                        onChange={(e) =>
                          updateDose(i, doseValue, e.target.value)
                        }
                        className="h-9 shrink-0 rounded-md border border-input bg-white px-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                      >
                        {optionsWith(DOSE_UNITS, doseUnit).map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <FieldLabel>Route</FieldLabel>
                    <select
                      value={m.route}
                      onChange={(e) => updateMed(i, "route", e.target.value)}
                      className={selectCls}
                    >
                      {m.route.trim() === "" && <option value="">—</option>}
                      {optionsWith(ROUTE_OPTIONS, m.route).map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Freq</FieldLabel>
                    <select
                      value={m.frequency}
                      onChange={(e) =>
                        updateMed(i, "frequency", e.target.value)
                      }
                      className={selectCls}
                    >
                      {m.frequency.trim() === "" && <option value="">—</option>}
                      {optionsWith(FREQ_OPTIONS, m.frequency).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <FieldLabel>Duration</FieldLabel>
                    <Input
                      value={m.duration}
                      onChange={(e) => updateMed(i, "duration", e.target.value)}
                      className="bg-white"
                    />
                  </div>
                </div>

                {/* Inline safety flags for THIS drug */}
                {rowFlags.map((f, fi) => (
                  <div
                    key={fi}
                    className={cn(
                      "flex items-start gap-1.5 rounded-md border px-2 py-1.5 text-xs",
                      f.severity === "critical"
                        ? "border-red-300 bg-red-100 text-red-800"
                        : "border-amber-300 bg-amber-100 text-amber-800",
                    )}
                  >
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      <span className="font-semibold capitalize">
                        {f.severity} · {f.type} —{" "}
                      </span>
                      {f.reason}
                    </span>
                  </div>
                ))}
              </div>
            );
          })}
          <Button
            variant="outline"
            size="sm"
            onClick={addMed}
            className="w-full border-dashed text-slate-500"
          >
            <Plus className="h-4 w-4" />
            Add medication
          </Button>
        </CardContent>
      </Card>

      {/* Card 3 — Nurse tasks */}
      <Card className="border-slate-200">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-slate-500" /> Nurse tasks
            <span className="text-sm font-normal text-slate-400">
              ({tasks.length})
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tasks.length === 0 && (
            <p className="text-sm text-slate-500">No nurse tasks extracted.</p>
          )}
          {tasks.map((t, i) => (
            <div
              key={i}
              className="space-y-2 rounded-lg border border-slate-100 bg-slate-50/60 p-3"
            >
              <div className="flex items-start gap-2">
                <select
                  value={t.priority}
                  onChange={(e) => updateTask(i, "priority", e.target.value)}
                  className={cn(
                    "mt-0.5 shrink-0 rounded-full border-0 px-2 py-0.5 text-xs font-medium capitalize focus:outline-none focus:ring-1 focus:ring-slate-300",
                    PRIORITY_STYLES[t.priority],
                  )}
                >
                  <option value="low">low</option>
                  <option value="normal">normal</option>
                  <option value="high">high</option>
                  <option value="critical">critical</option>
                </select>
                <Input
                  value={t.task}
                  onChange={(e) => updateTask(i, "task", e.target.value)}
                  className="bg-white"
                />
                {t.obs_type && (
                  <span className="mt-0.5 shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium uppercase text-indigo-700">
                    {t.obs_type}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => removeTask(i)}
                  aria-label="Remove task"
                  className="mt-0.5 shrink-0 rounded p-1 text-slate-300 hover:bg-red-50 hover:text-red-500"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <FieldLabel>When</FieldLabel>
                  <Input
                    value={t.when}
                    onChange={(e) => updateTask(i, "when", e.target.value)}
                    className="bg-white"
                  />
                </div>
                <div>
                  <FieldLabel>Conditions</FieldLabel>
                  <Input
                    value={t.conditions ?? ""}
                    placeholder="—"
                    onChange={(e) =>
                      updateTask(i, "conditions", e.target.value)
                    }
                    className="bg-white"
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={addTask}
            className="w-full border-dashed text-slate-500"
          >
            <Plus className="h-4 w-4" />
            Add task
          </Button>
        </CardContent>
      </Card>

      {/* Confirm → /api/dispatch → tasks + realtime (Task 4.2). */}
      <ConfirmButton
        noteId={data.noteId}
        criticalFlags={criticalFlags}
        getPayload={() => ({
          medical_note: note,
          medications: meds,
          nurse_tasks: tasks,
          safety_flags: flags,
        })}
      />
    </div>
  );
}
