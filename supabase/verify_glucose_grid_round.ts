// Live verification — 2026-07-08 round:
//   Bug 1  Gemini "null"-string sanitisation (schemas transform)
//   Bug 2  MO med_key wiring (isMedCell exclusion semantics — pure)
//   Bug 4  dispatch materialises only remaining slots (+ first-dose-now fallback)
//   Feat   ordered glucose QDS → routine-grid cells (dispatch + ensureTodayObsOrders
//          via the bed page, incl. discontinue exclusion)
//
// Uses a SANDBOX patient (bed 99, MRN SBX999) so live demo beds are untouched;
// every row it creates is deleted at the end. Needs the dev server on :3000
// for the dispatch/bed-page legs (skipped with a warning if it's down).
// Run:  node --experimental-strip-types supabase/verify_glucose_grid_round.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

import { ExtractSchema } from "../src/lib/ai/schemas.ts";
import {
  gridObsOrderSlots,
  isGridSpecialInstruction,
} from "../src/lib/clinical/obs-routing.ts";
import { instructionKey } from "../src/lib/clinical/watch-for.ts";
import type { NurseTask } from "../src/lib/supabase/types.ts";

const env = Object.fromEntries(
  fs
    .readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [
        l.slice(0, i).trim(),
        l.slice(i + 1).trim().replace(/^["']|["']$/g, ""),
      ];
    }),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

const BASE = "http://localhost:3000";
const WARD = "Ward 5A";
const BED = "99";
const MRN = "SBX999";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// ---------- A. Pure checks ----------
function pureChecks() {
  console.log("\nA. Pure checks");

  const parsed = ExtractSchema.parse({
    medical_note: { chief_complaint: "x", hpi: "x", exam: "x", assessment: "x", plan: "x" },
    medications: [
      { drug: "Amoxicillin", dose: "500 mg", route: "PO", frequency: "TDS", duration: "5 days", admin_instruction: "null" },
      { drug: "Paracetamol", dose: "1 g", route: "PO", frequency: "PRN", duration: "N/A", admin_instruction: "None" },
    ],
    nurse_tasks: [
      { task: "Check blood sugar", when: "QDS", conditions: "null", priority: "normal", obs_type: "glucose" },
    ],
    icd10_suggestions: [],
    safety_flags: [],
  });
  check('admin_instruction "null" → null', parsed.medications[0].admin_instruction === null);
  check('admin_instruction "None" → null', parsed.medications[1].admin_instruction === null);
  check('duration "N/A" → ""', parsed.medications[1].duration === "");
  check('conditions "null" → null', parsed.nurse_tasks[0].conditions === null);

  const glucoseQds: NurseTask = { task: "Check blood sugar", when: "QDS", conditions: null, priority: "normal", obs_type: "glucose" };
  const slots = gridObsOrderSlots(glucoseQds);
  check("glucose QDS → grid slots 8/12/16/20", JSON.stringify(slots?.map((s) => s.hour)) === "[8,12,16,20]");
  check("glucose QDS is a Special Instruction", isGridSpecialInstruction(glucoseQds));
  check("glucose Q8H (6/14/22 off-grid) → not grid", gridObsOrderSlots({ ...glucoseQds, when: "Q8H" }) === null);
  check("glucose stat (one-off) → not grid", gridObsOrderSlots({ ...glucoseQds, when: "stat" }) === null);
  check("bp QDS (default routine vital) → not grid", gridObsOrderSlots({ ...glucoseQds, obs_type: "bp" }) === null);
}

// ---------- B. Live sandbox ----------
async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    return r.ok;
  } catch {
    return false;
  }
}

async function cleanup(patientId: string | null) {
  if (!patientId) return;
  await sb.from("tasks").delete().eq("patient_id", patientId);
  await sb.from("clinical_notes").delete().eq("patient_id", patientId);
  await sb.from("audit_log").delete().eq("entity_id", patientId);
  // dispatch audit rows key on the note id; sweep any rows tagged with our MRN
  await sb.from("audit_log").delete().contains("metadata", { patient_id: patientId });
  await sb.from("patients").delete().eq("id", patientId);
}

async function liveChecks() {
  console.log("\nB. Live sandbox (bed 99)");

  if (!(await serverUp())) {
    console.log("  ! dev server not reachable on :3000 — skipping live legs");
    return;
  }

  // Fresh sandbox patient.
  await sb.from("patients").delete().eq("mrn", MRN);
  const { data: patient, error: pErr } = await sb
    .from("patients")
    .insert({
      mrn: MRN,
      full_name: "Sandbox Test",
      age: 50,
      gender: "M",
      bed_number: BED,
      ward: WARD,
      diagnosis: "sandbox",
      allergies: [],
    })
    .select("id")
    .single();
  if (pErr || !patient) {
    check("create sandbox patient", false, pErr?.message);
    return;
  }
  const pid = patient.id as string;

  try {
    // Draft note → dispatch (the real API route).
    const medications = [
      { drug: "Amoxicillin", dose: "500 mg", route: "PO", frequency: "TDS", duration: "5 days", admin_instruction: "null" },
    ];
    const nurse_tasks = [
      { task: "Check blood sugar", when: "QDS", conditions: "null", priority: "normal", obs_type: "glucose" },
    ];
    const medical_note = { chief_complaint: "x", hpi: "x", exam: "x", assessment: "x", plan: "x" };
    const { data: note, error: nErr } = await sb
      .from("clinical_notes")
      .insert({
        patient_id: pid,
        doctor_id: "00000000-0000-0000-0000-000000000001",
        medical_note,
        medications,
        nurse_tasks,
        status: "draft",
      })
      .select("id")
      .single();
    if (nErr || !note) {
      check("create draft note", false, nErr?.message);
      return;
    }

    const res = await fetch(`${BASE}/api/dispatch`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ noteId: note.id, medical_note, medications, nurse_tasks }),
    });
    check("dispatch returns 200", res.ok, `${res.status} ${await res.text().catch(() => "")}`);

    const nowHour = new Date().getHours();
    const { data: tasks } = await sb.from("tasks").select("*").eq("patient_id", pid);
    const all = tasks ?? [];

    // Bug 1 — no "null" leaked into descriptions/conditions.
    check(
      'no task text contains "null"',
      all.every((t) => !/\bnull\b/i.test(t.description ?? "") && !/^null$/i.test(t.conditions ?? "")),
      all.map((t) => t.description).join(" | "),
    );

    // Bug 4 — TDS (8/14/22): only slots >= now hour; none left → one first-dose-now cell.
    const medCells = all.filter((t) => t.med_key === "med:amoxicillin");
    const tdsRemaining = [8, 14, 22].filter((h) => h >= nowHour);
    if (tdsRemaining.length > 0) {
      check(
        `MAR cells = remaining TDS slots ${JSON.stringify(tdsRemaining)}`,
        medCells.length === tdsRemaining.length &&
          medCells.every((t) => new Date(t.scheduled_for).getHours() >= nowHour),
        `got ${medCells.map((t) => t.scheduled_for?.slice(11, 16)).join(",")}`,
      );
    } else {
      check(
        "MAR fallback = single first-dose-now cell",
        medCells.length === 1 && new Date(medCells[0].scheduled_for).getHours() === nowHour,
        `got ${medCells.length} cells`,
      );
    }

    // Feature — glucose QDS becomes grid cells (routine_key), not loose tasks.
    const glucoseCells = all.filter((t) => t.routine_key === "vitals:glucose");
    const looseGlucose = all.filter((t) => t.obs_type === "glucose" && !t.routine_key);
    const qdsRemaining = [8, 12, 16, 20].filter((h) => h >= nowHour);
    if (qdsRemaining.length > 0) {
      check(
        `glucose grid cells at remaining QDS slots ${JSON.stringify(qdsRemaining)}`,
        glucoseCells.length === qdsRemaining.length &&
          glucoseCells.every((t) => t.description.startsWith("Blood glucose (ordered")),
        `got ${glucoseCells.map((t) => `${t.description}@${t.scheduled_for?.slice(11, 16)}`).join(",")}`,
      );
      check("no loose glucose tasks", looseGlucose.length === 0, `got ${looseGlucose.length}`);
    } else {
      check(
        "glucose fallback = single loose task (grid starts tomorrow)",
        glucoseCells.length === 0 && looseGlucose.length === 1,
        `grid=${glucoseCells.length} loose=${looseGlucose.length}`,
      );
    }

    // ensureTodayObsOrders — delete the glucose cells, reload the bed page, they return.
    await sb.from("tasks").delete().eq("patient_id", pid).eq("routine_key", "vitals:glucose");
    await fetch(`${BASE}/patient/${BED}`, { headers: { accept: "text/html" } });
    const { data: after } = await sb
      .from("tasks")
      .select("id, scheduled_for")
      .eq("patient_id", pid)
      .eq("routine_key", "vitals:glucose");
    if (qdsRemaining.length > 0) {
      check(
        "bed-page open re-materialises glucose cells (remaining slots only)",
        (after ?? []).length === qdsRemaining.length,
        `got ${(after ?? []).length}, want ${qdsRemaining.length}`,
      );
    } else {
      check("bed-page open creates no cells after last slot", (after ?? []).length === 0);
    }

    // Discontinue exclusion — a stop NEWER than the note blocks re-materialisation.
    await sb.from("audit_log").insert({
      actor_role: "doctor",
      action: "instruction_discontinued",
      entity_type: "patient",
      entity_id: pid,
      metadata: { patient_id: pid, task_key: instructionKey("Check blood sugar"), task: "Check blood sugar", sandbox_test: true },
    });
    await sb.from("tasks").delete().eq("patient_id", pid).eq("routine_key", "vitals:glucose");
    await fetch(`${BASE}/patient/${BED}`, { headers: { accept: "text/html" } });
    const { data: afterStop } = await sb
      .from("tasks")
      .select("id")
      .eq("patient_id", pid)
      .eq("routine_key", "vitals:glucose");
    check("discontinued order does NOT re-materialise", (afterStop ?? []).length === 0, `got ${(afterStop ?? []).length}`);
  } finally {
    await cleanup(pid);
    const { data: leftover } = await sb.from("patients").select("id").eq("mrn", MRN);
    check("sandbox cleaned up", (leftover ?? []).length === 0);
  }
}

pureChecks();
await liveChecks();
console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
