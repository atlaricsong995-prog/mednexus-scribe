// Live E2E verify: bed-page AbnormalAckBanner (2026-07-06).
// 1. insert a sandbox submitted+abnormal nurse completion for MRN001
// 2. GET /doctor/<bed> → banner + item must render
// 3. PATCH /api/tasks/<id>/approve → 200, status approved
// 4. GET page again → banner gone
// 5. PATCH again → 409 (double-ack guard)
// 6. cleanup: delete the sandbox task + its audit rows
// Run: node --experimental-strip-types scratchpad/verify_abnormal_ack_banner.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

const ROOT = "/Users/atlaric/Desktop/Claude/mednexus-scribe";
const BASE = "http://localhost:3000";

const env = Object.fromEntries(
  fs
    .readFileSync(`${ROOT}/.env.local`, "utf8")
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

const DESC = "TEST-ACKBANNER Heart rate spot check";

async function main() {
  const { data: patient, error: pErr } = await sb
    .from("patients")
    .select("id, mrn, full_name, bed_number, ward")
    .eq("mrn", "MRN001")
    .single();
  if (pErr || !patient) throw new Error(`patient: ${pErr?.message}`);
  console.log(`Patient: ${patient.full_name} · Bed ${patient.bed_number}`);
  const pageUrl = `${BASE}/doctor/${encodeURIComponent(patient.bed_number)}`;

  // 1. sandbox submitted+abnormal completion (non-grid → adHocTasks)
  const { data: task, error: tErr } = await sb
    .from("tasks")
    .insert({
      patient_id: patient.id,
      ward: patient.ward,
      task_type: "observation",
      description: DESC,
      abnormal: true,
      status: "submitted",
      completed_by: "00000000-0000-0000-0000-000000000002",
      completed_by_name: "Nurse Siti",
      completion_value: "HR 132 bpm",
      submitted_at: new Date().toISOString(),
    })
    .select("id, status")
    .single();
  if (tErr || !task) throw new Error(`insert: ${tErr?.message}`);
  console.log(`Sandbox task: ${task.id}`);

  try {
    // 2. banner renders
    // "awaiting your sign-off" is emitted ONLY by the banner on this page
    // (ApprovalsPanel lives on the dashboard). The raw description also appears
    // inside the patient-window worklist HTML, so it can't discriminate alone.
    const html1 = await (await fetch(pageUrl)).text();
    check("page loads", html1.length > 0);
    check("banner renders", html1.includes("awaiting your sign-off"));
    check("test item renders", html1.includes(DESC));
    check("value renders", html1.includes("HR 132 bpm"));

    // 3. acknowledge via the same endpoint the button calls
    const res1 = await fetch(`${BASE}/api/tasks/${task.id}/approve`, {
      method: "PATCH",
    });
    const body1 = await res1.json();
    check("PATCH approve → 200", res1.status === 200, `got ${res1.status}`);
    check(
      "status → approved (not bounced to pending)",
      body1.task?.status === "approved",
      `got ${body1.task?.status}`,
    );

    // 4. banner gone (the approved task itself legitimately remains in the
    //    patient-window worklist HTML, so assert on the banner heading)
    const html2 = await (await fetch(pageUrl)).text();
    check("banner gone after ack", !html2.includes("awaiting your sign-off"));

    // 5. double-ack guard
    const res2 = await fetch(`${BASE}/api/tasks/${task.id}/approve`, {
      method: "PATCH",
    });
    check("second PATCH → 409", res2.status === 409, `got ${res2.status}`);
  } finally {
    // 6. cleanup: sandbox task + the audit row its approval wrote
    await sb.from("audit_log").delete().eq("entity_id", task.id);
    await sb.from("tasks").delete().eq("id", task.id);
    const { data: leftover } = await sb
      .from("tasks")
      .select("id")
      .eq("id", task.id);
    check("cleanup: sandbox task deleted", (leftover ?? []).length === 0);
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
