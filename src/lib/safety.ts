// Deterministic clinical safety check (D-008) — server-only, NO LLM.
//
// Gemini produces safety_flags at extraction time, but the doctor can edit the
// medication list before confirming. This module re-derives the flags from the
// *final* medications + patient allergies so the dispatch override gate reflects
// what is actually being prescribed (removing a drug clears its flag; adding a
// dangerous drug raises a new one). The rule set mirrors SAFETY_RULES below,
// which is the single source of truth shared with the Gemini prompt.
import type { Medication, SafetyFlag } from "@/lib/supabase/types";

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

// Frequency token -> doses per day.
const FREQ_PER_DAY: Record<string, number> = {
  od: 1,
  daily: 1,
  om: 1,
  on: 1,
  stat: 1,
  bd: 2,
  bid: 2,
  q12h: 2,
  tds: 3,
  tid: 3,
  q8h: 3,
  qds: 4,
  qid: 4,
  q6h: 4,
  q4h: 6,
};

// Human-readable rule text injected into the Gemini prompt — keeps the LLM and
// this deterministic checker describing the SAME rules.
export const SAFETY_RULES = `Known allergy cross-reactions: penicillin -> amoxicillin, ampicillin, augmentin, co-amoxiclav, flucloxacillin.
Dose range checks: metformin max 2000mg/day | amlodipine max 10mg/day | metoprolol max 200mg/day.
Duplicate class: do not combine 2 CCBs (e.g. amlodipine + nifedipine).`;

function norm(s: string): string {
  return (s ?? "").toLowerCase().trim();
}

// Parse a free-text dose ("1g", "1000mg", "1.2 g", "500mcg") to milligrams.
function doseToMg(dose: string): number | null {
  const m = norm(dose).match(/([\d.]+)\s*(mcg|mg|g)?/);
  if (!m) return null;
  const val = parseFloat(m[1]);
  if (Number.isNaN(val)) return null;
  const unit = m[2] ?? "mg";
  if (unit === "g") return val * 1000;
  if (unit === "mcg") return val / 1000;
  return val;
}

// Parse a frequency ("TDS", "1g three times a day" already normalised by Gemini
// to "TDS"/"Q6H") to doses per day. Returns null for PRN/unknown (skip ceiling).
function freqPerDay(frequency: string): number | null {
  const f = norm(frequency).replace(/[\s.]/g, "");
  if (!f || f.includes("prn")) return null;
  for (const [token, n] of Object.entries(FREQ_PER_DAY)) {
    if (f === token || f.includes(token)) return n;
  }
  return null;
}

// Match an allergy/class table key against a drug name, both directions.
function matches(drug: string, key: string): boolean {
  return drug.includes(key) || key.includes(drug);
}

// Re-derive D-008 safety flags from the final medication list + allergies.
export function checkMedicationSafety(
  meds: Medication[],
  allergies: string[],
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

  // 3. Duplicate drug class -> warning.
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
