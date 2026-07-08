// Live verification — 2026-07-08 2E round:
//   Bug    ward-data drops MO-proposed medications (med_key filter) — the
//          attending's approval queue lost them on every page load
//   Feat A propose-time already-on-chart duplicate check (findActiveDuplicate
//          → safety_alert on the proposal + warning back to the MO)
//   Feat B attending rejects a proposal with a mandatory reason → status
//          'rejected' + proposal_rejected audit row → MO inbox, ackable
//
// Uses a SANDBOX patient (bed 98, MRN SBX998) so live demo beds are untouched;
// every row it creates is deleted at the end. Needs the dev server on :3000
// for the HTTP legs (skipped with a warning if it's down).
// Run:  node --experimental-strip-types supabase/verify_proposal_reject_round.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

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
// findActiveDuplicate builds its own admin client from process.env.
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY;

const { findActiveDuplicate } = await import(
  "../src/lib/server/duplicate-check.ts"
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);

const BASE = process.env.VERIFY_BASE ?? "http://localhost:3000";
const WARD = "Ward 5A";
const BED = "98";
const MRN = "SBX998";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: string) {
  console.log(`${ok ? "  ✓" : "  ✗ FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

async function serverUp(): Promise<boolean> {
  try {
    const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

async function cleanup(patientId: string | null) {
  if (!patientId) return;
  const { data: rows } = await sb
    .from("tasks")
    .select("id")
    .eq("patient_id", patientId);
  const taskIds = (rows ?? []).map((r) => r.id as string);
  if (taskIds.length > 0) {
    // reject/ack audit rows key on the task id / on each other
    const { data: audits } = await sb
      .from("audit_log")
      .select("id")
      .in("entity_id", taskIds);
    const auditIds = (audits ?? []).map((a) => a.id as string);
    if (auditIds.length > 0) {
      await sb.from("audit_log").delete().in("entity_id", auditIds); // alert_acks
      await sb.from("audit_log").delete().in("id", auditIds);
    }
  }
  await sb.from("tasks").delete().eq("patient_id", patientId);
  await sb.from("clinical_notes").delete().eq("patient_id", patientId);
  await sb.from("audit_log").delete().eq("entity_id", patientId);
  await sb.from("audit_log").delete().contains("metadata", { patient_id: patientId });
  await sb.from("patients").delete().eq("id", patientId);
}

async function run() {
  console.log("\n2E round — proposal duplicate check + reject with reason");

  // Fresh sandbox patient with Paracetamol on the confirmed chart.
  await sb.from("patients").delete().eq("mrn", MRN);
  const { data: patient, error: pErr } = await sb
    .from("patients")
    .insert({
      mrn: MRN,
      full_name: "Sandbox Reject",
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
    process.exit(1);
  }
  const pid = patient.id as string;

  try {
    const { error: nErr } = await sb.from("clinical_notes").insert({
      patient_id: pid,
      doctor_id: "00000000-0000-0000-0000-000000000001",
      medical_note: { chief_complaint: "x", hpi: "x", exam: "x", assessment: "x", plan: "x" },
      medications: [
        { drug: "Paracetamol", dose: "1 g", route: "PO", frequency: "QDS", duration: "5 days" },
      ],
      nurse_tasks: [],
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    check("create confirmed note (Paracetamol on chart)", !nErr, nErr?.message);

    // --- A. findActiveDuplicate ---
    console.log("\nA. Propose-time duplicate check");
    const dupChart = await findActiveDuplicate(pid, "Paracetamol");
    check(
      "same drug on chart → duplicate message",
      !!dupChart && /already on the current chart/i.test(dupChart),
      dupChart ?? "null",
    );
    const dupCase = await findActiveDuplicate(pid, "  PARACETAMOL ");
    check("case/space-insensitive (med_key match)", !!dupCase);
    const noDup = await findActiveDuplicate(pid, "Ibuprofen");
    check("different drug → no flag", noDup === null, noDup ?? "");

    // An open resident order for a drug NOT on the chart.
    const { data: openProposal } = await sb
      .from("tasks")
      .insert({
        patient_id: pid,
        ward: WARD,
        task_type: "medication",
        description: "Ibuprofen 400 mg PO TDS",
        med_key: "med:ibuprofen",
        proposed_by_mo: true,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        priority: "normal",
      })
      .select("id")
      .single();
    const dupProposal = await findActiveDuplicate(pid, "Ibuprofen");
    check(
      "open resident order → duplicate message",
      !!dupProposal && /active resident order/i.test(dupProposal),
      dupProposal ?? "null",
    );

    // --- B. HTTP legs ---
    if (!(await serverUp())) {
      console.log("\n  ! dev server not reachable on :3000 — skipping live legs");
      return;
    }

    console.log("\nB. Ward data regression (proposal visible after reload)");
    // The proposal above has med_key set — before the ward-data fix it vanished
    // from the server-rendered approval queue. The /doctor page must carry it.
    const doctorHtml = await (await fetch(`${BASE}/doctor`)).text();
    check(
      "/doctor HTML contains the proposed order",
      doctorHtml.includes("Ibuprofen 400 mg PO TDS"),
    );

    console.log("\nC. Reject with reason");
    const proposalId = openProposal!.id as string;
    const reject = (id: string, body: unknown, referer?: string) =>
      fetch(`${BASE}/api/tasks/${id}/reject`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(referer ? { referer } : {}),
        },
        body: JSON.stringify(body),
      });

    const noRole = await reject(proposalId, { reason: "dup" });
    check("no doctor referer → 403", noRole.status === 403, String(noRole.status));

    const noReason = await reject(proposalId, { reason: "  " }, `${BASE}/doctor`);
    check("empty reason → 400", noReason.status === 400, String(noReason.status));

    const ok = await reject(
      proposalId,
      { reason: "Already covered by current analgesia — review the chart first." },
      `${BASE}/doctor`,
    );
    check("valid reject → 200", ok.ok, String(ok.status));

    const { data: after } = await sb
      .from("tasks")
      .select("status")
      .eq("id", proposalId)
      .single();
    check("task status → rejected", after?.status === "rejected", after?.status);

    const again = await reject(proposalId, { reason: "twice" }, `${BASE}/doctor`);
    check("second reject → 409", again.status === 409, String(again.status));

    const { data: auditRows } = await sb
      .from("audit_log")
      .select("id, metadata")
      .eq("action", "proposal_rejected")
      .eq("entity_id", proposalId);
    const audit = (auditRows ?? [])[0];
    const meta = (audit?.metadata ?? {}) as Record<string, unknown>;
    check("proposal_rejected audit row written", !!audit);
    check(
      "audit carries reason + message + patient",
      typeof meta.reason === "string" &&
        typeof meta.message === "string" &&
        meta.patient_id === pid,
      JSON.stringify(meta),
    );

    // A nurse COMPLETION in 'submitted' must not be rejectable.
    const { data: completion } = await sb
      .from("tasks")
      .insert({
        patient_id: pid,
        ward: WARD,
        task_type: "observation",
        description: "Sandbox completed obs",
        status: "submitted",
        submitted_at: new Date().toISOString(),
        completed_by: "00000000-0000-0000-0000-000000000002",
        completion_value: "37.0",
        priority: "normal",
      })
      .select("id")
      .single();
    const notProposal = await reject(
      completion!.id as string,
      { reason: "no" },
      `${BASE}/doctor`,
    );
    check("nurse completion → 409 (not rejectable)", notProposal.status === 409, String(notProposal.status));

    console.log("\nD. MO acknowledges the rejection alert");
    const ack = await fetch(`${BASE}/api/alerts/${audit!.id}/ack`, {
      method: "POST",
      headers: { referer: `${BASE}/mo` },
    });
    check("MO ack of proposal_rejected → 200", ack.ok, String(ack.status));
  } finally {
    await cleanup(pid);
    console.log("\n  sandbox cleaned");
  }
}

run().then(() => {
  console.log(`\n${fail === 0 ? "ALL PASS" : "FAILURES"} — ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
});
