// Baseline demo state for Ward 5A (問題 1) — the single source of truth shared by
// the CLI seed script (supabase/seed_baseline_records.ts) and the in-app demo
// reset (POST /api/admin/reset). Existing inpatients already HAVE a confirmed
// record the moment you open their window; today's dictation appends to it. Bed 17
// (MRN006) is intentionally left as a genuine new admission (no note).
//
// This module holds DATA + the reset routine only; the caller supplies its own
// Supabase service-role client (the Next route uses createAdminClient(); the CLI
// script builds one from .env.local). Type-only imports here so the CLI can load
// it under `node --experimental-strip-types`.
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Medication, NurseTask, MedicalNote } from "@/lib/supabase/types";

export const DEMO_DOCTOR_ID = "00000000-0000-0000-0000-000000000001";
export const BASELINE_WARD = "Ward 5A";
const TODAY = "2026-06-30";

interface Baseline {
  mrn: string;
  confirmedAt: string; // when the baseline note was written (ward-round / admission)
  medical_note: MedicalNote;
  medications: Medication[];
  nurse_tasks: NurseTask[];
  icd10: string[];
}

const med = (
  drug: string,
  dose: string,
  route: string,
  frequency: string,
  duration = "",
): Medication => ({ drug, dose, route, frequency, duration });

// Baselines keyed by MRN. Bed 17 (MRN006) is intentionally absent — new admission.
export const BASELINES: Baseline[] = [
  {
    mrn: "MRN001", // Bed 12 — Encik Lim Ah Kow, T2DM/HTN, post-op chole day 2
    confirmedAt: "2026-06-24T09:00:00Z",
    medical_note: {
      chief_complaint: "Post-operative ward review — day 2 after laparoscopic cholecystectomy.",
      hpi: "67-year-old man with type 2 diabetes and hypertension, admitted for elective laparoscopic cholecystectomy on 22/06. Surgery uneventful. Tolerating oral fluids, pain well controlled. Capillary glucose mildly elevated post-operatively.",
      exam: "Alert and comfortable. Abdomen soft, non-tender; port sites clean and dry. Chest clear. CVS: S1S2, no murmur.",
      assessment: "Post lap-cholecystectomy day 2, recovering well. T2DM with suboptimal peri-operative glycaemic control. Hypertension stable.",
      plan: "Continue Metformin and Amlodipine. Monitor capillary blood glucose QDS. Encourage early mobilisation and oral intake. Aim for discharge in 1–2 days once glucose settles.",
    },
    medications: [
      med("Metformin", "1000 mg", "PO", "BD"),
      med("Amlodipine", "5 mg", "PO", "OD"),
      med("Paracetamol", "1 g", "PO", "QDS", "PRN"),
    ],
    nurse_tasks: [
      {
        task: "Monitor capillary blood glucose",
        when: "QDS — pre-meals and bedtime",
        conditions: "Notify MO if glucose > 15 mmol/L or < 4 mmol/L",
        priority: "high",
        obs_type: "glucose",
      },
      {
        task: "Surgical wound / port-site observation",
        when: "Each shift",
        conditions: "Escalate if increasing redness, discharge or fever",
        priority: "normal",
        obs_type: null,
      },
    ],
    icd10: ["E11.9", "I10", "K80.20"],
  },
  {
    mrn: "MRN002", // Bed 13 — Puan Siti Aminah, CHF NYHA III
    confirmedAt: "2026-06-19T10:00:00Z",
    medical_note: {
      chief_complaint: "Worsening breathlessness and leg swelling.",
      hpi: "54-year-old woman with known congestive heart failure, presenting with 5 days of increasing exertional dyspnoea, orthopnoea and bilateral ankle oedema.",
      exam: "Mild respiratory distress at rest. JVP raised. Bibasal crepitations. Bilateral pitting pedal oedema to mid-shin.",
      assessment: "Decompensated congestive cardiac failure, NYHA III. Fluid overloaded.",
      plan: "IV diuresis, daily weights, fluid restriction 1.5 L/day, strict input/output charting. Monitor U&E and potassium.",
    },
    medications: [
      med("Furosemide", "40 mg", "IV", "BD"),
      med("Bisoprolol", "2.5 mg", "PO", "OD"),
      med("Perindopril", "4 mg", "PO", "OD"),
    ],
    nurse_tasks: [
      {
        task: "Strict fluid balance and daily weight",
        when: "Daily 06:00",
        conditions: "Notify MO if weight gain > 1 kg/day or urine output < 30 mL/hr",
        priority: "high",
        obs_type: null,
      },
      {
        task: "Monitor SpO₂ and respiratory rate",
        when: "Q4H",
        conditions: "Escalate if SpO₂ < 92%",
        priority: "high",
        obs_type: "spo2",
      },
    ],
    icd10: ["I50.9"],
  },
  {
    mrn: "MRN003", // Bed 14 — Mr. Raj Kumar, COPD exacerbation
    confirmedAt: "2026-06-23T11:30:00Z",
    medical_note: {
      chief_complaint: "Increasing cough, breathlessness and green sputum.",
      hpi: "72-year-old man, known COPD and ex-smoker, with a 3-day history of increasing dyspnoea, productive cough with purulent sputum, and wheeze.",
      exam: "Tachypnoeic, using accessory muscles. Widespread expiratory wheeze with reduced air entry at both bases. SpO₂ 90% on room air.",
      assessment: "Infective exacerbation of COPD.",
      plan: "Controlled oxygen to target SpO₂ 88–92%. Nebulised bronchodilators, IV corticosteroid, oral antibiotic. Chest physiotherapy.",
    },
    medications: [
      med("Salbutamol", "5 mg", "INH", "QDS"),
      med("Ipratropium", "500 mcg", "INH", "QDS"),
      med("Hydrocortisone", "100 mg", "IV", "QDS"),
      med("Doxycycline", "100 mg", "PO", "OD", "5 days"),
    ],
    nurse_tasks: [
      {
        task: "Monitor SpO₂ (target 88–92%)",
        when: "Q2H",
        conditions: "Notify MO if SpO₂ < 88%, or rising drowsiness/confusion",
        priority: "high",
        obs_type: "spo2",
      },
      {
        task: "Nebuliser administration and response",
        when: "QDS",
        conditions: null,
        priority: "normal",
        obs_type: null,
      },
    ],
    icd10: ["J44.1"],
  },
  {
    mrn: "MRN004", // Bed 15 — Ms. Tan Mei Hua, Post-MI day 3
    confirmedAt: "2026-06-21T09:30:00Z",
    medical_note: {
      chief_complaint: "Recovery after a heart attack.",
      hpi: "45-year-old woman, day 3 following an anterior STEMI treated with primary PCI to the LAD. Chest pain free since the procedure.",
      exam: "Comfortable at rest. CVS: S1S2, no added sounds. Chest clear. No clinical signs of heart failure.",
      assessment: "Post anterior STEMI day 3, stable on dual antiplatelet therapy. Cardiac rehabilitation phase 1.",
      plan: "Continue dual antiplatelets, high-intensity statin, beta-blocker and ACE inhibitor. Cardiac monitoring. Graded mobilisation and cardiac rehab referral.",
    },
    medications: [
      med("Aspirin", "100 mg", "PO", "OD"),
      med("Ticagrelor", "90 mg", "PO", "BD"),
      med("Atorvastatin", "40 mg", "PO", "ON"),
      med("Bisoprolol", "2.5 mg", "PO", "OD"),
      med("Ramipril", "2.5 mg", "PO", "OD"),
    ],
    nurse_tasks: [
      {
        task: "Continuous cardiac (telemetry) monitoring",
        when: "Continuous",
        conditions: "Escalate immediately for chest pain or new arrhythmia",
        priority: "high",
        obs_type: null,
      },
      {
        task: "Vital signs including blood pressure",
        when: "Q4H",
        conditions: null,
        priority: "normal",
        obs_type: "bp",
      },
    ],
    icd10: ["I21.0", "I25.10"],
  },
  {
    mrn: "MRN005", // Bed 16 — Encik Hassan, CKD stage 4
    confirmedAt: "2026-06-17T10:15:00Z",
    medical_note: {
      chief_complaint: "Routine review of advanced kidney disease.",
      hpi: "60-year-old man with chronic kidney disease stage 4 (diabetic nephropathy), admitted for management of fluid status and borderline hyperkalaemia.",
      exam: "Euvolaemic. Mild pallor. No asterixis. Chest clear. No peripheral oedema.",
      assessment: "CKD stage 4 with controlled hyperkalaemia. Anaemia of chronic disease.",
      plan: "Low-potassium diet, fluid balance charting, avoid nephrotoxic drugs. Monitor potassium and renal function. Nephrology follow-up.",
    },
    medications: [
      med("Calcium resonium", "15 g", "PO", "TDS"),
      med("Sodium bicarbonate", "840 mg", "PO", "BD"),
      med("Furosemide", "40 mg", "PO", "OD"),
    ],
    nurse_tasks: [
      {
        task: "Strict fluid balance and daily weight",
        when: "Daily",
        conditions: "Notify MO if urine output < 30 mL/hr",
        priority: "high",
        obs_type: null,
      },
      {
        task: "Watch for hyperkalaemia symptoms",
        when: "Each shift",
        conditions: "Escalate palpitations or muscle weakness; report latest K⁺",
        priority: "high",
        obs_type: null,
      },
    ],
    icd10: ["N18.4"],
  },
];

// Loosely-typed client (SupabaseClient's generics default to `any`) so both the
// typed admin client and the CLI's untyped client satisfy it without generic
// friction or coupling these inserts to the generated schema types.
type AnyClient = SupabaseClient;

async function patientByMrn(sb: AnyClient, mrn: string): Promise<string | null> {
  const { data } = await sb
    .from("patients")
    .select("id")
    .eq("mrn", mrn)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function wipePatient(sb: AnyClient, patientId: string) {
  // Tasks first (some reference note_id), then notes.
  await sb.from("tasks").delete().eq("patient_id", patientId);
  await sb.from("clinical_notes").delete().eq("patient_id", patientId);
}

export interface ResetSummary {
  seeded: string[];
  skipped: string[];
  newAdmission: boolean;
}

// Restore Ward 5A to its baseline: re-seed the confirmed records for MRN001–005,
// leave MRN006 as a fresh admission, and clear the demo alert log so the doctor/MO
// inboxes start empty. Idempotent — safe to run repeatedly. Routine/MAR grid cells
// re-materialise per day on view, so wiping tasks is safe.
export async function resetBaseline(sb: AnyClient): Promise<ResetSummary> {
  const seeded: string[] = [];
  const skipped: string[] = [];

  for (const b of BASELINES) {
    const pid = await patientByMrn(sb, b.mrn);
    if (!pid) {
      skipped.push(b.mrn);
      continue;
    }
    await wipePatient(sb, pid);
    const { error } = await sb.from("clinical_notes").insert({
      patient_id: pid,
      doctor_id: DEMO_DOCTOR_ID,
      medical_note: b.medical_note,
      medications: b.medications,
      nurse_tasks: b.nurse_tasks,
      icd10_suggestions: b.icd10,
      safety_flags: [],
      status: "confirmed",
      confirmed_at: b.confirmedAt,
    });
    if (error) skipped.push(`${b.mrn} (${error.message})`);
    else seeded.push(b.mrn);
  }

  // Bed 17 (MRN006) — genuine new admission: no note, admitted today.
  let newAdmission = false;
  const newAdmit = await patientByMrn(sb, "MRN006");
  if (newAdmit) {
    await wipePatient(sb, newAdmit);
    await sb
      .from("patients")
      .update({
        admission_date: TODAY,
        diagnosis: "Community-acquired pneumonia (new admission)",
      })
      .eq("id", newAdmit);
    newAdmission = true;
  }

  // Clear the demo alert log (escalations + break-glass views) so the doctor/MO
  // inboxes are empty on a fresh run.
  await sb
    .from("audit_log")
    .delete()
    .in("action", ["escalation", "break_glass_view"]);

  return { seeded, skipped, newAdmission };
}
