// Server-only loaders for the patient window (Enh Day 2). Uses the service-role
// admin client (the demo has no auth session); RBAC masking is applied by the
// caller based on role, NOT by RLS.
import { createAdminClient } from "@/lib/supabase/admin";
import type { ClinicalNote, Patient } from "@/lib/supabase/types";

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
