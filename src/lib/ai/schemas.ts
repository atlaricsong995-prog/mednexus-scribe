// Zod schemas for the Gemini extract output (Tech Spec §8 + D-008 safety).
// These validate the LLM JSON before it is persisted to clinical_notes, so a
// drifting model can't write malformed jsonb (D-009 revisit note: validate + retry).
//
// The first three mirror the hand-written interfaces in lib/supabase/types.ts
// (MedicalNote / Medication / NurseTask). safety_flags is display-only for Day 3
// (no DB column yet — persisted on Day 4 with dispatch, see plan).
import { z } from "zod";

export const MedicationSchema = z.object({
  drug: z.string(),
  dose: z.string(),
  route: z.string(),
  frequency: z.string(),
  duration: z.string(),
});

export const NurseTaskSchema = z.object({
  task: z.string(),
  when: z.string(),
  conditions: z.string().nullable(),
  priority: z.enum(["low", "normal", "high", "critical"]),
  // For observation/vital tasks, the controlled type from OBSERVATION_CATALOG
  // (bp/glucose/temp/spo2/hr/rr) so the nurse gets a fixed-unit input and the
  // value can be range-checked. null for non-observation tasks.
  obs_type: z
    .enum(["bp", "glucose", "temp", "spo2", "hr", "rr"])
    .nullable(),
});

export const MedicalNoteSchema = z.object({
  chief_complaint: z.string(),
  hpi: z.string(),
  exam: z.string(),
  assessment: z.string(),
  plan: z.string(),
});

// D-008 medication safety interception (MVP rule set; Phase 2 → full BNF).
export const SafetyFlagSchema = z.object({
  type: z.enum(["allergy", "dose", "duplicate"]),
  drug: z.string(),
  reason: z.string(),
  severity: z.enum(["critical", "warning"]),
});

export const ExtractSchema = z.object({
  medical_note: MedicalNoteSchema,
  medications: z.array(MedicationSchema),
  nurse_tasks: z.array(NurseTaskSchema),
  icd10_suggestions: z.array(z.string()),
  safety_flags: z.array(SafetyFlagSchema),
});

export type ExtractResult = z.infer<typeof ExtractSchema>;
export type SafetyFlag = z.infer<typeof SafetyFlagSchema>;
