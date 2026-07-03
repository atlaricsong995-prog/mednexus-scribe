// Deterministic clinical safety check (D-008) — NO LLM.
//
// Gemini produces safety_flags at extraction time, but the doctor can edit the
// medication list before confirming. This module re-derives the flags from the
// *final* medications + patient allergies so the dispatch override gate reflects
// what is actually being prescribed (removing a drug clears its flag; adding a
// dangerous drug raises a new one). The rule set mirrors SAFETY_RULES below,
// which is the single source of truth shared with the Gemini prompt.
//
// Dose/frequency are read through the structured vocab helpers (lib/clinical/
// vocab) rather than ad-hoc regex, so the math matches the controlled units the
// prescribing UI now produces. Pure — safe to run client-side for live flags.
import type { Medication, SafetyFlag } from "@/lib/supabase/types";
import { doseToMg, freqPerDay } from "@/lib/clinical/vocab";

// Allergy label -> drug names that conflict with it (cross-reactivity).
const ALLERGY_CROSS: Record<string, string[]> = {
  penicillin: [
    "penicillin",
    "amoxicillin",
    "ampicillin",
    "augmentin",
    "co-amoxiclav",
    "coamoxiclav",
    "flucloxacillin",
  ],
};

// Max safe daily dose (mg/day) per drug.
const MAX_DAILY_MG: Record<string, number> = {
  metformin: 2000,
  amlodipine: 10,
  metoprolol: 200,
};

// Drug -> class, for duplicate-class detection.
const DRUG_CLASS: Record<string, string> = {
  amlodipine: "CCB",
  nifedipine: "CCB",
};

// Human-readable rule text injected into the Gemini prompt — keeps the LLM and
// this deterministic checker describing the SAME rules.
export const SAFETY_RULES = `Known allergy cross-reactions: penicillin -> amoxicillin, ampicillin, augmentin, co-amoxiclav, flucloxacillin.
Dose range checks: metformin max 2000mg/day | amlodipine max 10mg/day | metoprolol max 200mg/day.
Duplicate class: do not combine 2 CCBs (e.g. amlodipine + nifedipine).`;

function norm(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

// Match an allergy/class table key against a drug name, both directions.
function matches(drug: string, key: string): boolean {
  return drug.includes(key) || key.includes(drug);
}

// Re-derive D-008 safety flags from the final medication list + allergies.
// `currentMeds` = the patient's current confirmed record's medications — a newly
// prescribed drug that is already on that chart raises a duplicate warning
// (double-ordering, or an intentional "continue" the doctor should confirm).
export function checkMedicationSafety(
  meds: Medication[],
  allergies: string[],
  currentMeds: Medication[] = [],
): SafetyFlag[] {
  const flags: SafetyFlag[] = [];
  const allergyLabels = (allergies ?? []).map(norm).filter(Boolean);

  for (const m of meds) {
    const drug = norm(m.drug);
    if (!drug) continue;

    // 1. Allergy conflict -> critical.
    for (const label of allergyLabels) {
      const cross = ALLERGY_CROSS[label] ?? [label];
      if (cross.some((c) => matches(drug, c))) {
        flags.push({
          type: "allergy",
          drug: m.drug,
          reason: `Patient has a known ${label} allergy; ${m.drug} is contraindicated.`,
          severity: "critical",
        });
        break;
      }
    }

    // 2. Dose ceiling -> warning.
    const maxEntry = Object.entries(MAX_DAILY_MG).find(([k]) => matches(drug, k));
    const perDose = doseToMg(m.dose);
    const perDay = freqPerDay(m.frequency);
    if (maxEntry && perDose != null && perDay != null) {
      const total = perDose * perDay;
      if (total > maxEntry[1]) {
        flags.push({
          type: "dose",
          drug: m.drug,
          reason: `Prescribed ${m.dose} ${m.frequency} (${total}mg/day) exceeds the maximum ${maxEntry[1]}mg/day.`,
          severity: "warning",
        });
      }
    }
  }

  // 3. Already on the current chart -> duplicate warning. The new order may be a
  // deliberate continuation, but the doctor must see that the drug is already
  // prescribed rather than silently stacking a second order.
  for (const m of meds) {
    const drug = norm(m.drug);
    if (!drug) continue;
    const existing = (currentMeds ?? []).find((c) => {
      const cur = norm(c.drug);
      return !!cur && matches(drug, cur);
    });
    if (existing) {
      flags.push({
        type: "duplicate",
        drug: m.drug,
        reason: `${m.drug} is already on the current medication chart (${[existing.drug, existing.dose, existing.frequency].filter(Boolean).join(" ")}). Confirm this replaces the existing order.`,
        severity: "warning",
      });
    }
  }

  // 4. Duplicate drug class -> warning.
  const byClass = new Map<string, string[]>();
  for (const m of meds) {
    const drug = norm(m.drug);
    const cls = Object.entries(DRUG_CLASS).find(([k]) => matches(drug, k))?.[1];
    if (cls) byClass.set(cls, [...(byClass.get(cls) ?? []), m.drug]);
  }
  for (const [cls, drugs] of Array.from(byClass)) {
    if (drugs.length > 1) {
      flags.push({
        type: "duplicate",
        drug: drugs.join(" + "),
        reason: `Duplicate ${cls} class: ${drugs.join(" and ")} should not be combined.`,
        severity: "warning",
      });
    }
  }

  return flags;
}
