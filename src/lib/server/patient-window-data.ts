// Server-only loaders for the patient window (Enh Day 2). Uses the service-role
// admin client (the demo has no auth session); RBAC masking is applied by the
// caller based on role, NOT by RLS.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureTodayRoutine,
  getTodayRoutineTasks,
  getTodayMedTasks,
} from "@/lib/server/routine";
import { canViewRecord } from "@/lib/server/role";
import type {
  ClinicalNote,
  NurseTask,
  Patient,
  Role,
  Task,
} from "@/lib/supabase/types";

export async function getPatientByBed(
  ward: string,
  bedNumber: string,
): Promise<Patient | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("patients")
    .select("*")
    .eq("ward", ward)
    .eq("bed_number", bedNumber)
    .maybeSingle();
  return (data as Patient) ?? null;
}

// The current medical record = the single CONFIRMED clinical note. Dispatch keeps
// the timeline append-only: confirming a new note archives the prior one, so there
// is exactly one 'confirmed' (current) note per patient (Enh Day 3).
export async function getLatestConfirmedNote(
  patientId: string,
): Promise<ClinicalNote | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("clinical_notes")
    .select("*")
    .eq("patient_id", patientId)
    .eq("status", "confirmed")
    .order("confirmed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ClinicalNote) ?? null;
}

// Archived (superseded) notes, newest first — the read-only history shown under the
// current record (Enh Day 3, plan point 5).
export async function getRecordHistory(
  patientId: string,
): Promise<ClinicalNote[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("clinical_notes")
    .select("*")
    .eq("patient_id", patientId)
    .eq("status", "archived")
    .order("confirmed_at", { ascending: false });
  return (data as ClinicalNote[]) ?? [];
}

// Everything the <PatientWindow> needs, bundled + RBAC-masked, so both the
// /patient/[bed] route and the doctor's in-place record modal load it the same way.
// Returns null when the bed has no patient (caller decides 404 vs. ignore).
export interface PatientWindowData {
  patient: Patient;
  note: ClinicalNote | null;
  history: ClinicalNote[];
  watchFor: NurseTask[];
  routineTasks: Task[];
  medTasks: Task[];
  adHocTasks: Task[];
}

// Ad-hoc tasks for a patient = the completable worklist: everything that isn't a
// grid cell (MAR / routine). Procedures, one-off observations, authorised MO orders.
async function getAdHocTasks(patientId: string): Promise<Task[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("tasks")
    .select("*")
    .eq("patient_id", patientId)
    .is("routine_key", null)
    .is("med_key", null)
    .order("created_at", { ascending: false });
  return (data as Task[]) ?? [];
}

export async function getPatientWindowData(
  ward: string,
  bedNumber: string,
  role: Role | null,
): Promise<PatientWindowData | null> {
  const patient = await getPatientByBed(ward, bedNumber);
  if (!patient) return null;

  // Materialise today's routine vitals (idempotent), then load the grids.
  await ensureTodayRoutine(patient.id, patient.ward);

  const [currentNote, routineTasks, medTasks, adHocTasks] = await Promise.all([
    getLatestConfirmedNote(patient.id),
    getTodayRoutineTasks(patient.id),
    getTodayMedTasks(patient.id),
    getAdHocTasks(patient.id),
  ]);

  // Record body + history are only loaded when the role may see them; the
  // watch-for list is operational and shown to everyone (computed server-side).
  const showRecord = canViewRecord(role);
  const note = showRecord ? currentNote : null;
  const history = showRecord ? await getRecordHistory(patient.id) : [];

  const watchFor: NurseTask[] =
    currentNote?.nurse_tasks.filter(
      (t) => t.conditions || t.priority === "high" || t.priority === "critical",
    ) ?? [];

  return { patient, note, history, watchFor, routineTasks, medTasks, adHocTasks };
}
