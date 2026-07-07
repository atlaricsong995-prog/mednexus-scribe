// Server-only loaders for the patient window (Enh Day 2). Uses the service-role
// admin client (the demo has no auth session); RBAC masking is applied by the
// caller based on role, NOT by RLS.
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ensureTodayRoutine,
  ensureTodayMeds,
  ensureTodayObsOrders,
  getTodayRoutineTasks,
  getTodayMedTasks,
} from "@/lib/server/routine";
import { canViewRecord } from "@/lib/server/role";
import {
  computeWatchFor,
  type DiscontinueEvent,
} from "@/lib/clinical/watch-for";
import { checkMedicationSafety } from "@/lib/safety";
import type { NoteReviewData } from "@/components/note-review-panel";
import type {
  ClinicalNote,
  Medication,
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
    // MO-proposed medication orders carry a med_key (safety nets) yet remain
    // worklist items, not MAR cells — keep them on the completable list.
    .or("med_key.is.null,proposed_by_mo.is.true")
    .order("created_at", { ascending: false });
  return (data as Task[]) ?? [];
}

// Latest-per-key reduction happens inside computeWatchFor; this just reads the
// raw append-only discontinue events for one patient (audit_log, same channel
// escalation/break-glass use — no dedicated table).
async function getDiscontinueEvents(
  patientId: string,
): Promise<DiscontinueEvent[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audit_log")
    .select("created_at, metadata")
    .eq("action", "instruction_discontinued")
    .eq("entity_id", patientId);
  const rows = (data ?? []) as {
    created_at: string;
    metadata: { task_key?: string } | null;
  }[];
  return rows.flatMap((r) =>
    r.metadata?.task_key
      ? [{ task_key: r.metadata.task_key, created_at: r.created_at }]
      : [],
  );
}

// Rebuild the review payload for a still-DRAFT note so it can re-open on a
// different bed's page (問題 1 — after a right-patient re-target the doctor lands
// on the correct chart with the note ready to confirm). Guarded: the note must be
// a draft AND belong to this patient, so a stale ?reviewNote link can't surface a
// confirmed/foreign note. Safety flags are re-derived against THIS patient's
// allergies (the panel does the same live), matching the dispatch-time re-check.
export async function getDraftNoteReview(
  noteId: string,
  patientId: string,
  allergies: string[],
): Promise<NoteReviewData | null> {
  const supabase = createAdminClient();
  const { data: note } = await supabase
    .from("clinical_notes")
    .select(
      "id, patient_id, status, medical_note, medications, nurse_tasks, icd10_suggestions",
    )
    .eq("id", noteId)
    .maybeSingle();

  if (!note || note.status !== "draft" || note.patient_id !== patientId) {
    return null;
  }

  const medications = (note.medications ?? []) as Medication[];
  const currentMeds = ((await getLatestConfirmedNote(patientId))?.medications ??
    []) as Medication[];
  return {
    noteId: note.id,
    medical_note: note.medical_note,
    medications,
    nurse_tasks: note.nurse_tasks ?? [],
    icd10_suggestions: note.icd10_suggestions ?? [],
    safety_flags: checkMedicationSafety(medications, allergies, currentMeds),
    allergies,
    current_medications: currentMeds,
    patient_check: null,
  };
}

// The doctor's most recent unconfirmed draft for a patient, rebuilt as a review
// payload — extraction persists a draft immediately, so navigating away before
// dispatch must NOT lose the note. The bed page restores it on the next visit.
export async function getLatestDraftReview(
  patientId: string,
  allergies: string[],
): Promise<NoteReviewData | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("clinical_notes")
    .select("id")
    .eq("patient_id", patientId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return getDraftNoteReview(data.id, patientId, allergies);
}

export async function getPatientWindowData(
  ward: string,
  bedNumber: string,
  role: Role | null,
): Promise<PatientWindowData | null> {
  const patient = await getPatientByBed(ward, bedNumber);
  if (!patient) return null;

  // Materialise today's routine vitals + MAR give-times (idempotent), then load the
  // grids. Both re-materialise per day so a multi-day order / standing routine shows
  // fresh cells today instead of the dispatch day's.
  await Promise.all([
    ensureTodayRoutine(patient.id, patient.ward),
    ensureTodayMeds(patient.id, patient.ward),
    ensureTodayObsOrders(patient.id, patient.ward),
  ]);

  const [currentNote, routineTasks, medTasks, adHocTasks, discontinued] =
    await Promise.all([
      getLatestConfirmedNote(patient.id),
      getTodayRoutineTasks(patient.id),
      getTodayMedTasks(patient.id),
      getAdHocTasks(patient.id),
      getDiscontinueEvents(patient.id),
    ]);

  // Record body + history are only EXPOSED when the role may see them; the
  // watch-for list is operational and shown to everyone (computed server-side).
  const showRecord = canViewRecord(role);
  const note = showRecord ? currentNote : null;
  const fullHistory = await getRecordHistory(patient.id);
  const history = showRecord ? fullHistory : [];

  // Standing/special instructions carry FORWARD across note confirmations,
  // minus doctor-discontinued orders; a later re-order revives (all the
  // aggregation + exclusion semantics live in computeWatchFor).
  const watchFor = computeWatchFor(
    [currentNote, ...fullHistory],
    discontinued,
  );

  return { patient, note, history, watchFor, routineTasks, medTasks, adHocTasks };
}
