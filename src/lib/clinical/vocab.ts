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
  normal: [number, number]; // inclusive [low, high]
  step?: number;
  placeholder?: string;
}
interface ObsBp {
  label: string;
  unit: string;
  kind: "bp";
  systolic: [number, number];
  diastolic: [number, number];
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
    placeholder: "120/80",
  },
  glucose: {
    label: "Blood glucose",
    unit: "mmol/L",
    kind: "single",
    normal: [4, 10],
    step: 0.1,
    placeholder: "6.2",
  },
  temp: {
    label: "Temperature",
    unit: "°C",
    kind: "single",
    normal: [36, 37.8],
    step: 0.1,
    placeholder: "37.0",
  },
  spo2: {
    label: "SpO₂",
    unit: "%",
    kind: "single",
    normal: [94, 100],
    step: 1,
    placeholder: "98",
  },
  hr: {
    label: "Heart rate",
    unit: "bpm",
    kind: "single",
    normal: [60, 100],
    step: 1,
    placeholder: "78",
  },
  rr: {
    label: "Respiratory rate",
    unit: "/min",
    kind: "single",
    normal: [12, 20],
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
