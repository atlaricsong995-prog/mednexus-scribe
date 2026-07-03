// Right-patient cross-check (Enh Day 2) — a SOFT second safety net.
//
// The patient is already chosen deterministically by which bed the doctor opened
// (the URL binds patientId). This module is a belt-and-braces advisory: it scans
// the dictation transcript for a spoken patient identifier — bed number, MRN, or
// a distinctive name token — and matches it against the CLOSED ward roster (a
// handful of patients), not open-vocabulary recognition. That bounded matching is
// what makes it robust to accents/mis-transcription: we only ever compare a
// garbled token against ~10 known strings.
//
// It NEVER hard-blocks (would cause alarm fatigue). It only raises a warning when
// the transcript matches a DIFFERENT roster patient better than the open chart —
// i.e. positive evidence the doctor is dictating about someone else. Pure data;
// safe to run server-side.

export interface RosterPatient {
  id: string;
  full_name: string;
  bed_number: string;
  mrn: string;
}

export interface PatientCheck {
  // match    = the open patient was positively identified in the dictation
  // mismatch = a *different* roster patient was identified more strongly
  // unverified = no identifier was spoken (stay silent / neutral)
  status: "match" | "mismatch" | "unverified";
  openLabel: string;
  spokenLabel?: string; // populated on mismatch — who the dictation sounds like
  spokenPatientId?: string; // id of that patient, so the note can be re-targeted
  basis?: string; // what matched, e.g. "bed 14" / "name \"Raj\"" — for the banner
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

// Honorifics / titles to strip before treating the remainder as distinctive name
// tokens (these are not identifying — every other patient may share a title).
const TITLE_TOKENS = new Set([
  "encik", "puan", "cik", "tuan", "datuk", "dato", "datin", "haji", "hajjah",
  "mr", "mrs", "ms", "mdm", "madam", "miss", "dr",
]);

function norm(s: string): string {
  return (s ?? "").toLowerCase();
}

// Whisper sometimes glues spoken tokens into one word — a real transcript
// contained "Mr. StrongBed17" for "Mrs. Chong, bed 17", which defeats every
// \b-anchored pattern below. Split camelCase and letter↔digit seams first
// (must run BEFORE lowercasing, which erases the case boundary).
function splitGlued(s: string): string {
  return (s ?? "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Za-z])(\d)/g, "$1 $2")
    .replace(/(\d)([A-Za-z])/g, "$1 $2");
}

export function label(p: RosterPatient): string {
  return `Bed ${p.bed_number} · ${p.full_name} · ${p.mrn}`;
}

// Distinctive (non-title, length>=3) lowercase name tokens for a patient.
function nameTokens(fullName: string): string[] {
  return norm(fullName)
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !TITLE_TOKENS.has(t));
}

// Bed numbers spoken in the transcript. CRITICAL: only a number that directly
// follows "bed"/"katil" counts — a ward dictation is full of unrelated numbers
// ("for 5 days", "fifteen hundred mg", "1 gram") and bed numbers here are 12–17,
// so matching any bare number would constantly collide with doses/durations and
// scramble the check. Anchoring to the keyword keeps it precise.
function spokenBeds(t: string): Set<number> {
  const beds = new Set<number>();
  // "bed 12", "bed no 12", "bed number 12", "bed #12", "katil 12"
  for (const m of Array.from(
    t.matchAll(/\b(?:bed|katil)\s*(?:no\.?|number|#)?\s*(\d{1,3})\b/g),
  ))
    beds.add(parseInt(m[1], 10));
  // "bed twelve"
  for (const [word, n] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b(?:bed|katil)\\s+${word}\\b`).test(t)) beds.add(n);
  }
  return beds;
}

// Trailing digits of an MRN spoken as "MRN 3" / "MRN003" / "M-R-N 003".
function mrnSpoken(t: string, mrn: string): boolean {
  const digits = mrn.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return false;
  const m = t.match(/\bm\s*\.?\s*r\s*\.?\s*n\s*\.?\s*0*(\d+)\b/);
  return !!m && m[1] === digits;
}

interface Scored {
  patient: RosterPatient;
  score: number;
  basis: string;
}

// Score how strongly the transcript identifies a given patient.
//   bed number  → 3 (strong, distinctive)
//   MRN         → 3 (strong)
//   name token  → 2 each (moderate; tolerant of mis-transcription)
function scorePatient(t: string, beds: Set<number>, p: RosterPatient): Scored {
  let score = 0;
  const basis: string[] = [];

  // Bed is a SECONDARY hint only — it's a location (changes on transfer) and a
  // real bed code is compound (e.g. "B2-5A-13B"). We match the bed's trailing
  // LOCAL number (the part anyone would actually say: "bed 13"), so compound
  // formats work and we never collapse "5A-13B" into a bogus "513". MRN + name
  // are the reliable identifiers and carry the check.
  const localBed = p.bed_number.match(/(\d+)\D*$/);
  const bed = localBed ? parseInt(localBed[1], 10) : NaN;
  if (!Number.isNaN(bed) && beds.has(bed)) {
    score += 3;
    basis.push(`bed ${p.bed_number}`);
  }
  if (mrnSpoken(t, p.mrn)) {
    score += 3;
    basis.push(p.mrn);
  }
  for (const tok of nameTokens(p.full_name)) {
    if (new RegExp(`\\b${tok}\\b`).test(t)) {
      score += 2;
      basis.push(`name "${tok}"`);
    }
  }
  return { patient: p, score, basis: basis.join(", ") };
}

export function crossCheckPatient(
  transcript: string,
  open: RosterPatient,
  roster: RosterPatient[],
): PatientCheck {
  const t = norm(splitGlued(transcript));
  const beds = spokenBeds(t);

  const openScore = scorePatient(t, beds, open);
  // Best-scoring OTHER patient on the ward.
  let bestOther: Scored | null = null;
  for (const p of roster) {
    if (p.id === open.id) continue;
    const s = scorePatient(t, beds, p);
    if (s.score > 0 && (!bestOther || s.score > bestOther.score)) bestOther = s;
  }

  // A different patient is identified MORE strongly than the open chart → warn.
  if (bestOther && bestOther.score > openScore.score) {
    return {
      status: "mismatch",
      openLabel: label(open),
      spokenLabel: label(bestOther.patient),
      spokenPatientId: bestOther.patient.id,
      basis: bestOther.basis,
    };
  }

  if (openScore.score > 0) {
    return { status: "match", openLabel: label(open), basis: openScore.basis };
  }

  return { status: "unverified", openLabel: label(open) };
}
