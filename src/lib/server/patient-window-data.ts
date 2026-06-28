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

// The current medical record = the most recent CONFIRMED clinical note.
// (Day 3 turns this into an append-only timeline; for now it's the latest.)
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
