// Gemini clinical-extraction helper (server-only).
//
// LLM = Google Gemini gemini-3-flash-preview (D-009 — NOT Anthropic/Claude).
// Reads a doctor's English transcript + patient context and returns structured
// JSON (medical note / meds / nurse tasks / icd-10 / D-008 safety flags), enforced
// by Gemini structured output (responseMimeType + responseSchema) AND re-validated
// with Zod (one retry on drift) before the caller persists it.
import {
  GoogleGenerativeAI,
  SchemaType,
  type GenerationConfig,
  type ResponseSchema,
} from "@google/generative-ai";

import { GEMINI_MODEL } from "@/lib/constants";
import { SAFETY_RULES } from "@/lib/safety";
import { ROUTE_OPTIONS, FREQ_OPTIONS, DOSE_UNITS } from "@/lib/clinical/vocab";
import { ExtractSchema, type ExtractResult } from "./schemas";

export interface PatientContext {
  name: string;
  age: number | null;
  diagnosis: string | null;
  allergies: string[];
}

// Mirrors ExtractSchema (lib/ai/schemas.ts). Gemini guarantees this shape; Zod
// is the safety net.
const RESPONSE_SCHEMA: ResponseSchema = {
  type: SchemaType.OBJECT,
  properties: {
    medical_note: {
      type: SchemaType.OBJECT,
      properties: {
        chief_complaint: { type: SchemaType.STRING },
        hpi: { type: SchemaType.STRING },
        exam: { type: SchemaType.STRING },
        assessment: { type: SchemaType.STRING },
        plan: { type: SchemaType.STRING },
      },
      required: ["chief_complaint", "hpi", "exam", "assessment", "plan"],
    },
    medications: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          drug: { type: SchemaType.STRING },
          dose: { type: SchemaType.STRING },
          route: { type: SchemaType.STRING },
          frequency: { type: SchemaType.STRING },
          duration: { type: SchemaType.STRING },
        },
        required: ["drug", "dose", "route", "frequency", "duration"],
      },
    },
    nurse_tasks: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          task: { type: SchemaType.STRING },
          when: { type: SchemaType.STRING },
          conditions: { type: SchemaType.STRING, nullable: true },
          priority: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["low", "normal", "high", "critical"],
          },
          obs_type: {
            type: SchemaType.STRING,
            format: "enum",
            nullable: true,
            enum: ["bp", "glucose", "temp", "spo2", "hr", "rr"],
          },
        },
        required: ["task", "when", "conditions", "priority", "obs_type"],
      },
    },
    icd10_suggestions: {
      type: SchemaType.ARRAY,
      items: { type: SchemaType.STRING },
    },
    safety_flags: {
      type: SchemaType.ARRAY,
      items: {
        type: SchemaType.OBJECT,
        properties: {
          type: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["allergy", "dose", "duplicate"],
          },
          drug: { type: SchemaType.STRING },
          reason: { type: SchemaType.STRING },
          severity: {
            type: SchemaType.STRING,
            format: "enum",
            enum: ["critical", "warning"],
          },
        },
        required: ["type", "drug", "reason", "severity"],
      },
    },
  },
  required: [
    "medical_note",
    "medications",
    "nurse_tasks",
    "icd10_suggestions",
    "safety_flags",
  ],
};

function buildPrompt(
  transcript: string,
  ctx: PatientContext,
  nowIso: string,
): string {
  return `You are a clinical documentation assistant for a Malaysian government hospital ward.
Read a transcribed doctor's voice note and output structured JSON.

CONTEXT:
- Patient name: ${ctx.name}
- Age: ${ctx.age ?? "unknown"}
- Known diagnosis: ${ctx.diagnosis ?? "none recorded"}
- Allergies: ${ctx.allergies.length ? ctx.allergies.join(", ") : "NKDA"}
- Now (ISO): ${nowIso}

RULES:
1. Output VALID JSON only, matching the provided schema. No prose.
2. EXTRACT ONLY what the doctor actually dictated in the transcript. Do NOT invent or infer
   medications, diagnoses, history, or tasks from the patient context. The patient context is
   for identification and the safety check ONLY — never copy it into the note as if it were
   dictated, and never add regular/home medications that were not spoken.
3. Use Malaysian medical conventions (e.g. "BD" not "BID", "TDS" not "TID").
   ALL output text MUST be in English only. If the transcript contains Malay or
   Chinese words, translate them to standard English medical terms (e.g. darah
   tinggi -> hypertension, kencing manis -> diabetes, 血糖 -> blood sugar,
   发烧 -> fever). Never leave non-English words in any field.
4. SAFETY CHECK (D-008): cross-check every medication against patient allergies AND dose ranges below.
   - Allergy conflict -> safety_flags entry {type:"allergy", drug, reason, severity:"critical"}
   - Dose out of range -> {type:"dose", drug, reason, severity:"warning"}
   - Duplicate drug class -> {type:"duplicate", drug, reason, severity:"warning"}
   - No issues -> safety_flags must be an empty array.
5. Convert relative times ("3 hours later", "every 6 hours") in nurse_tasks.when to absolute ISO timestamps based on Now above, or keep a clear interval like "Q6H".
6. Default priority "normal". Use "critical" only for life-threatening tasks.
7. DOSES — transcription is unreliable for numbers, so do NOT "fix" them:
   - A medication's dose comes SOLELY from the number the doctor spoke in the
     transcript. Copy it verbatim and keep the spoken unit (doctor says "1 gram"
     -> dose "1 g"; never rewrite to "1000 mg" or any other number).
   - FIREWALL: the numbers in the SAFETY RULES section below are thresholds for
     the safety check ONLY. NEVER copy a threshold (e.g. "2000mg", "10mg",
     "200mg") into medications[].dose. If you catch yourself writing a dose that
     equals a safety-rule number the doctor did not say, you are wrong.
   - medications[].dose MUST be consistent with how the same drug is described in
     medical_note.plan — they must not disagree.
   - If a dose is missing, garbled, or clinically implausible, do NOT guess.
     Still list the medication (dose "as charted"), and add a one-line query to
     medical_note.plan, e.g. "VERIFY: Metformin dose unclear in dictation."
8. Every medication MUST have drug, dose, route, frequency, duration (use "as charted" / "stat" if truly unspecified).
9. CONTROLLED UNITS — normalise to these tokens (the prescribing UI uses fixed dropdowns):
   - route MUST be one of: ${ROUTE_OPTIONS.join(", ")} (e.g. "by mouth"/"oral" -> "PO", "drip"/"intravenous" -> "IV"). If genuinely unclear, use "PO".
   - frequency MUST be one of: ${FREQ_OPTIONS.join(", ")} (e.g. "twice a day" -> "BD", "every 6 hours" -> "Q6H", "once only"/"immediately" -> "STAT", "when required" -> "PRN").
   - dose MUST be "<number> <unit>" where unit is one of: ${DOSE_UNITS.join(", ")} (keep the number the doctor spoke; see rule 7).
10. nurse_tasks.conditions is null when there is no condition.
11. obs_type — for nurse_tasks that record a routine vital sign / measurement, set obs_type to the matching catalog key:
    bp (blood pressure), glucose (blood sugar / BSL / capillary glucose), temp (temperature),
    spo2 (oxygen saturation / SpO₂ / sats), hr (heart rate / pulse), rr (respiratory rate).
    For any task that is NOT one of these measurements (medications to give, procedures, generic monitoring), obs_type MUST be null.

SAFETY RULES:
${SAFETY_RULES}

DOCTOR'S TRANSCRIPT:
${transcript}`;
}

function parseAndValidate(raw: string): ExtractResult {
  const json = JSON.parse(raw);
  return ExtractSchema.parse(json);
}

// Extract structured clinical data. Validates with Zod; on parse/validation
// failure retries once with a corrective nudge, then throws.
export async function extractNote(
  transcript: string,
  ctx: PatientContext,
  nowIso: string = new Date().toISOString(),
): Promise<ExtractResult> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: GEMINI_MODEL,
    // gemini-3-flash-preview enables "thinking" by default. For this strict,
    // schema-constrained extraction it roughly triples latency (~4s -> ~13s) and
    // occasionally spikes to minutes, hanging the doctor's "extracting…" screen.
    // We re-derive D-008 safety flags deterministically server-side (safety.ts),
    // so the extra reasoning buys little — cap it off for predictable latency.
    // (thinkingConfig isn't in this SDK's GenerationConfig type yet, but the SDK
    // forwards it to the REST body; verified ~4s vs ~13s.)
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.2,
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig,
  });

  const prompt = buildPrompt(transcript, ctx, nowIso);

  try {
    const res = await model.generateContent(prompt);
    return parseAndValidate(res.response.text());
  } catch (firstErr) {
    // One retry — most failures are transient JSON drift.
    const res = await model.generateContent(
      `${prompt}\n\nIMPORTANT: your previous reply was invalid (${
        firstErr instanceof Error ? firstErr.message : "parse error"
      }). Return ONLY valid JSON matching the schema.`,
    );
    return parseAndValidate(res.response.text());
  }
}
