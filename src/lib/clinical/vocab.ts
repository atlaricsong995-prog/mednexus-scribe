// Controlled clinical vocabulary + observation catalog (Enh Day 1, points 1+2).
//
// Single source of truth for the structured units the system uses everywhere:
//   - prescribing UI dropdowns (NoteReviewPanel) — route / frequency / dose unit,
//   - the Gemini extract prompt (so the LLM emits the same controlled tokens),
//   - the deterministic safety checker (freq -> doses/day, dose -> mg),
//   - the nurse observation inputs + abnormal-vital highlighting.
//
// Pure data + helpers — safe to import from client or server.

// --- Prescribing vocabulary ----------------------------------------------

// Route of administration (Malaysian ward conventions).
export const ROUTE_OPTIONS = [
  "PO", // oral
  "IV", // intravenous
  "IM", // intramuscular
  "SC", // subcutaneous
  "PR", // per rectum
  "INH", // inhaled
  "TOP", // topical
] as const;
export type Route = (typeof ROUTE_OPTIONS)[number];

// Dosing frequency (Malaysian abbreviations — BD not BID, TDS not TID).
export const FREQ_OPTIONS = [
  "OD", // once daily
  "BD", // twice daily
  "TDS", // three times daily
  "QDS", // four times daily
  "Q4H",
  "Q6H",
  "Q8H",
  "Q12H",
  "PRN", // as needed
  "STAT", // immediately, once
] as const;
export type Freq = (typeof FREQ_OPTIONS)[number];

// Dose units accepted in the medication editor.
export const DOSE_UNITS = ["mg", "g", "mcg", "mL", "units"] as const;
export type DoseUnit = (typeof DOSE_UNITS)[number];

// Advisory administration instructions (Workstream E) — food timing / cautions the
// nurse needs at give-time. Controlled set for the prescribing UI + Gemini; advisory
// only (does NOT change MAR scheduling).
export const ADMIN_INSTRUCTION_OPTIONS = [
  "before food",
  "with food",
  "after food",
  "empty stomach",
  "at night",
] as const;
export type AdminInstruction = (typeof ADMIN_INSTRUCTION_OPTIONS)[number];

// Frequency token -> administrations per day. PRN has no fixed count (null =
// skip dose-ceiling math). Includes a few legacy aliases the LLM/transcript may
// still produce so the safety checker stays robust.
export const FREQ_PER_DAY: Record<string, number | null> = {
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
  prn: null,
};

// Parse a dose string ("1 g", "500mg", "1.2 g", "500 mcg") into a value + unit.
// Returns null when there is no leading number (e.g. "as charted").
export function parseDose(
  dose: string,
): { value: number; unit: string } | null {
  const m = (dose ?? "").toLowerCase().trim().match(/([\d.]+)\s*([a-zµμ/]+)?/);
  if (!m) return null;
  const value = parseFloat(m[1]);
  if (Number.isNaN(value)) return null;
  return { value, unit: (m[2] ?? "mg").trim() };
}

// Convert a parsed dose to milligrams for ceiling checks. null for mL/units
// (volume/IU can't be compared against an mg ceiling).
export function doseToMg(dose: string): number | null {
  const parsed = parseDose(dose);
  if (!parsed) return null;
  switch (parsed.unit) {
    case "g":
      return parsed.value * 1000;
    case "mcg":
    case "µg":
    case "μg":
      return parsed.value / 1000;
    case "mg":
      return parsed.value;
    default:
      return null; // mL / units / unknown — not an mg quantity
  }
}

// Doses per day from a frequency token (already a controlled FREQ_OPTIONS value
// in the happy path; tolerant of free-text fallback). null = unknown/PRN.
export function freqPerDay(frequency: string): number | null {
  const f = (frequency ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (!f) return null;
  if (f.includes("prn")) return null;
  if (FREQ_PER_DAY[f] !== undefined) return FREQ_PER_DAY[f];
  for (const [token, n] of Object.entries(FREQ_PER_DAY)) {
    if (f.includes(token)) return n;
  }
  return null;
}

// --- Observation catalog --------------------------------------------------

export type ObsType = "bp" | "glucose" | "temp" | "spo2" | "hr" | "rr";

interface ObsSingle {
  label: string;
  unit: string;
  kind: "single";
  normal: [number, number]; // inclusive [low, high] — outside = abnormal (red)
  // Wider outer bound — a value outside `critical` is dangerous and auto-escalates
  // (Workstream C). Omit when no clinically meaningful critical band exists.
  critical?: [number, number];
  step?: number;
  placeholder?: string;
}
interface ObsBp {
  label: string;
  unit: string;
  kind: "bp";
  systolic: [number, number];
  diastolic: [number, number];
  // Outer bounds for systolic/diastolic — outside either = critical (auto-escalate).
  criticalSystolic?: [number, number];
  criticalDiastolic?: [number, number];
  placeholder?: string;
}
export type ObsSpec = ObsSingle | ObsBp;

// Each routine observation: fixed unit + normal range. Drives both the nurse
// completion inputs and the abnormal-vital red highlight.
export const OBSERVATION_CATALOG: Record<ObsType, ObsSpec> = {
  bp: {
    label: "Blood pressure",
    unit: "mmHg",
    kind: "bp",
    systolic: [90, 140],
    diastolic: [60, 90],
    criticalSystolic: [80, 180],
    criticalDiastolic: [50, 110],
    placeholder: "120/80",
  },
  glucose: {
    label: "Blood glucose",
    unit: "mmol/L",
    kind: "single",
    normal: [4, 10],
    critical: [3, 20],
    step: 0.1,
    placeholder: "6.2",
  },
  temp: {
    label: "Temperature",
    unit: "°C",
    kind: "single",
    normal: [36, 37.8],
    critical: [35, 39.5],
    step: 0.1,
    placeholder: "37.0",
  },
  spo2: {
    label: "SpO₂",
    unit: "%",
    kind: "single",
    normal: [94, 100],
    critical: [90, 100],
    step: 1,
    placeholder: "98",
  },
  hr: {
    label: "Heart rate",
    unit: "bpm",
    kind: "single",
    normal: [60, 100],
    critical: [40, 130],
    step: 1,
    placeholder: "78",
  },
  rr: {
    label: "Respiratory rate",
    unit: "/min",
    kind: "single",
    normal: [12, 20],
    critical: [8, 30],
    step: 1,
    placeholder: "16",
  },
};

export function isObsType(value: string | null | undefined): value is ObsType {
  return !!value && value in OBSERVATION_CATALOG;
}

// --- Routine timetable (Enh Day 3) ---------------------------------------
//
// The default standing order materialised for every patient: a small vitals set
// observed q4h. "Today only" — six slots at 00/04/08/12/16/20 (user decision: no
// scheduler, no future days). These drive the fillable grid in the patient window.

export const ROUTINE_SLOT_HOURS = [0, 4, 8, 12, 16, 20] as const;

// Vitals charted q4h. Rows of the timetable grid (glucose is dictated per-patient,
// not part of the standing routine — keeps the test for the one-off abnormal value).
export const DEFAULT_ROUTINE: ObsType[] = ["bp", "hr", "temp", "spo2"];

export const ROUTINE_PREFIX = "vitals";

export function routineKey(obs: ObsType): string {
  return `${ROUTINE_PREFIX}:${obs}`;
}

export function routineObsFromKey(
  key: string | null | undefined,
): ObsType | null {
  if (!key || !key.startsWith(`${ROUTINE_PREFIX}:`)) return null;
  const obs = key.slice(ROUTINE_PREFIX.length + 1);
  return isObsType(obs) ? obs : null;
}

// --- Medication administration record (MAR) -------------------------------
//
// Medications fan out into a give-time grid the same way routine vitals do:
// row = drug, columns = today's administration slots for its frequency. "Today
// only" (user decision: no scheduler). These are demo defaults — a sensible MAR
// timetable, not a clinical bible. PRN has no fixed slot (recorded ad-hoc when
// given); STAT is a single dose now (resolved at dispatch time, not from here).

export const FREQ_SLOTS: Record<string, number[]> = {
  od: [8],
  daily: [8],
  om: [8],
  on: [22],
  bd: [8, 20],
  bid: [8, 20],
  q12h: [8, 20],
  tds: [8, 14, 22],
  tid: [8, 14, 22],
  q8h: [6, 14, 22],
  qds: [8, 12, 16, 20],
  qid: [8, 12, 16, 20],
  q6h: [0, 6, 12, 18],
  q4h: [0, 4, 8, 12, 16, 20],
  // prn / stat handled specially (see medSlotHours) — no fixed grid here.
};

export const MED_PREFIX = "med";

// A MAR row key from the drug name — lowercased, spaces/punctuation collapsed so
// the same drug always maps to the same row (e.g. "Augmentin" -> 'med:augmentin').
export function medKey(drug: string): string {
  const slug = (drug ?? "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${MED_PREFIX}:${slug || "drug"}`;
}

export function isMedKey(key: string | null | undefined): boolean {
  return !!key && key.startsWith(`${MED_PREFIX}:`);
}

// Today's administration hours for a frequency. PRN -> [] (no fixed slot; charted
// ad-hoc). STAT -> a single "now" slot the caller anchors to the current hour.
// Unknown/free-text frequency -> [] (the drug still lists as a once-now row so it
// never silently vanishes — caller decides; see dispatch).
export function medSlotHours(frequency: string): number[] {
  const f = (frequency ?? "").toLowerCase().replace(/[\s.]/g, "");
  if (!f) return [];
  if (f.includes("prn")) return [];
  if (f.includes("stat")) return [new Date().getHours()];
  if (FREQ_SLOTS[f]) return FREQ_SLOTS[f];
  for (const [token, hours] of Object.entries(FREQ_SLOTS)) {
    if (f.includes(token)) return hours;
  }
  return [];
}

// Today's MAR slots for a frequency, as ISO timestamps anchored to the local day
// (mirrors todayRoutineSlots). Empty for PRN / unknown frequencies.
export function todayMedSlots(
  frequency: string,
  now: Date = new Date(),
): RoutineSlot[] {
  return medSlotHours(frequency).map((hour) => {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    return {
      hour,
      iso: d.toISOString(),
      label: `${String(hour).padStart(2, "0")}:00`,
    };
  });
}

export interface RoutineSlot {
  hour: number;
  iso: string; // today at this hour (local), as an ISO timestamp
  label: string; // "08:00"
}

// Today's q4h slots as ISO timestamps anchored to the local day. Re-deriving on a
// later call the same day yields the same hours, so materialisation stays idempotent.
export function todayRoutineSlots(now: Date = new Date()): RoutineSlot[] {
  return ROUTINE_SLOT_HOURS.map((hour) => {
    const d = new Date(now);
    d.setHours(hour, 0, 0, 0);
    return {
      hour,
      iso: d.toISOString(),
      label: `${String(hour).padStart(2, "0")}:00`,
    };
  });
}

// Determine whether a recorded observation value is outside its normal range.
// Accepts the raw completion string ("200/120", "6.2 mmol/L") and tolerates
// trailing units. Returns false for unknown types / unparseable values (we don't
// raise an alert we can't justify).
export function isAbnormal(
  type: ObsType | string | null | undefined,
  value: string | null | undefined,
): boolean {
  if (!isObsType(type) || !value) return false;
  const spec = OBSERVATION_CATALOG[type];

  if (spec.kind === "bp") {
    const m = value.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (!m) return false;
    const sys = parseFloat(m[1]);
    const dia = parseFloat(m[2]);
    return (
      sys < spec.systolic[0] ||
      sys > spec.systolic[1] ||
      dia < spec.diastolic[0] ||
      dia > spec.diastolic[1]
    );
  }

  const m = value.match(/-?\d+(?:\.\d+)?/);
  if (!m) return false;
  const n = parseFloat(m[0]);
  return n < spec.normal[0] || n > spec.normal[1];
}

export type ObsSeverity = "normal" | "abnormal" | "critical";

// Two-band classification of a recorded value (Workstream C). `normal` = in range;
// `abnormal` = outside the normal range (renders red, no alert); `critical` =
// outside the wider critical band (auto-escalates). Returns "normal" for unknown
// types / unparseable values, and never "critical" when no critical band is set.
export function obsSeverity(
  type: ObsType | string | null | undefined,
  value: string | null | undefined,
): ObsSeverity {
  if (!isObsType(type) || !value) return "normal";
  if (!isAbnormal(type, value)) return "normal";
  const spec = OBSERVATION_CATALOG[type];

  if (spec.kind === "bp") {
    const m = value.match(/(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/);
    if (!m) return "abnormal";
    const sys = parseFloat(m[1]);
    const dia = parseFloat(m[2]);
    const critSys =
      spec.criticalSystolic &&
      (sys < spec.criticalSystolic[0] || sys > spec.criticalSystolic[1]);
    const critDia =
      spec.criticalDiastolic &&
      (dia < spec.criticalDiastolic[0] || dia > spec.criticalDiastolic[1]);
    return critSys || critDia ? "critical" : "abnormal";
  }

  if (!spec.critical) return "abnormal";
  const m = value.match(/-?\d+(?:\.\d+)?/);
  if (!m) return "abnormal";
  const n = parseFloat(m[0]);
  return n < spec.critical[0] || n > spec.critical[1] ? "critical" : "abnormal";
}
