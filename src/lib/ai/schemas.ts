// Zod schemas for the Gemini extract output (Tech Spec §8 + D-008 safety).
// These validate the LLM JSON before it is persisted to clinical_notes, so a
// drifting model can't write malformed jsonb (D-009 revisit note: validate + retry).
//
// The first three mirror the hand-written interfaces in lib/supabase/types.ts
// (MedicalNote / Medication / NurseTask). safety_flags is display-only for Day 3
// (no DB column yet — persisted on Day 4 with dispatch, see plan).
import { z } from "zod";

// Gemini sometimes fills an empty optional field with the literal STRING "null"
// (or "none"/"N/A") instead of JSON null. `z.string().nullable()` accepts that
// happily, and the word then leaks into the ward UI ("Paracetamol 1 g PO PRN ·
// null" on the MAR, a watch condition reading "null" on task cards). Normalise
// every nullish spelling to a real null at the validation boundary.
const NULLISH_TEXT =
  /^(null|none|nil|n\/?a|not\s+(?:specified|stated|applicable)|-+|—)$/i;

function cleanOptionalText(v: string | null | undefined): string | null {
  const s = v?.trim();
  return !s || NULLISH_TEXT.test(s) ? null : s;
}

const nullableText = z
  .string()
  .nullable()
  .optional()
  .transform(cleanOptionalText);

export const MedicationSchema = z.object({
  drug: z.string(),
  dose: z.string(),
  route: z.string(),
  frequency: z.string(),
  // Required by contract (rule 8) but still sanitised: a nullish spelling would
  // otherwise render as "× null" / block the "· ongoing" fallback downstream.
  duration: z.string().transform((s) => (NULLISH_TEXT.test(s.trim()) ? "" : s)),
  // Advisory food-timing / caution (Workstream E). Optional — null when not dictated.
  admin_instruction: nullableText,
});

export const NurseTaskSchema = z.object({
  task: z.string(),
  when: z.string(),
  // Same sanitisation, but the key stays required (mirrors the NurseTask type).
  conditions: z.string().nullable().transform(cleanOptionalText),
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
