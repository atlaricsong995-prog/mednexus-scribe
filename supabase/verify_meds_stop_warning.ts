// Verify medsStoppedByNote + the reworded duplicate flag (2026-07-06, pure —
// no DB, no server). Mirrors the review-panel wiring: same inputs it passes.
// Run (safety.ts uses the @/ alias, so go via jiti):
//   JITI_ALIAS='{"@/":"<repo>/src/"}' node_modules/.bin/jiti supabase/verify_meds_stop_warning.ts
import {
  checkMedicationSafety,
  medsStoppedByNote,
} from "../src/lib/safety.ts";
import type { Medication } from "../src/lib/supabase/types.ts";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const med = (drug: string, dose = "", frequency = ""): Medication =>
  ({ drug, dose, frequency, route: "" }) as Medication;

const chart = [med("Metformin", "1000 mg", "bd"), med("Paracetamol", "1 g", "qds")];

// 1. Note restates Metformin (edited dose) but not Paracetamol → only Paracetamol stops.
let stops = medsStoppedByNote(
  [med("Augmentin", "1 g", "tds"), med("Metformin", "850 mg", "bd")],
  chart,
);
check(
  "restated drug (even new dose) does NOT stop",
  !stops.some((m) => m.drug === "Metformin"),
);
check(
  "omitted drug stops",
  stops.length === 1 && stops[0].drug === "Paracetamol",
  JSON.stringify(stops),
);

// 2. Doctor deletes the duplicate Metformin row → Metformin now listed as stopping.
stops = medsStoppedByNote([med("Augmentin", "1 g", "tds")], chart);
check(
  "deleting the duplicate row surfaces Metformin as stopping",
  stops.some((m) => m.drug === "Metformin") &&
    stops.some((m) => m.drug === "Paracetamol"),
  JSON.stringify(stops),
);

// 3. Case-insensitive / partial name matching (same rule as the duplicate flag).
stops = medsStoppedByNote(
  [med("insulin actrapid", "10 units", "stat")],
  [med("Insulin Actrapid", "8 units", "od")],
);
check("case/partial name match counts as restated", stops.length === 0);

// 4. Empty chart → nothing to stop; blank drug names ignored.
check("empty chart → []", medsStoppedByNote([med("X")], []).length === 0);
check(
  "blank chart drug ignored",
  medsStoppedByNote([], [med("")]).length === 0,
);

// 5. Duplicate flag reason now spells out keep/replace/STOP semantics.
const flags = checkMedicationSafety(
  [med("Metformin", "1000 mg", "bd")],
  [],
  chart,
);
const dup = flags.find((f) => f.type === "duplicate");
check("duplicate flag still raised", !!dup);
check(
  "reason explains delete = STOP",
  !!dup && /STOP the drug/.test(dup.reason),
  dup?.reason,
);
check(
  "reason explains keep row = continue/replace",
  !!dup && /Keep this row/.test(dup.reason),
);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
