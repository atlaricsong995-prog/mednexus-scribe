// Live verification of instruction discontinue across ALL patients (2026-07-04
// spec; user requirement: every bed, not one). Per patient:
//   1. baseline watchFor from live notes + audit events
//   2. insert a real instruction_discontinued row (tagged sandbox_test) for the
//      first instruction → recompute → must disappear, others untouched
//   3. revival: a synthetic newer note re-ordering it → must reappear (pure)
//   4. delete ONLY the tagged test rows → recompute → baseline restored
// Run:  node --experimental-strip-types supabase/verify_watchfor_discontinue.ts
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

import {
  computeWatchFor,
  instructionKey,
  type DiscontinueEvent,
} from "../src/lib/clinical/watch-for.ts";
import type { ClinicalNote, NurseTask } from "../src/lib/supabase/types.ts";

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

async function loadNotes(patientId: string): Promise<(ClinicalNote | null)[]> {
  const [{ data: confirmed }, { data: archived }] = await Promise.all([
    sb
      .from("clinical_notes")
      .select("nurse_tasks, confirmed_at")
      .eq("patient_id", patientId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(1),
    sb
      .from("clinical_notes")
      .select("nurse_tasks, confirmed_at")
      .eq("patient_id", patientId)
      .eq("status", "archived")
      .order("confirmed_at", { ascending: false }),
  ]);
  return [
    (confirmed?.[0] as ClinicalNote | undefined) ?? null,
    ...((archived ?? []) as ClinicalNote[]),
  ];
}

async function loadStops(patientId: string): Promise<DiscontinueEvent[]> {
  const { data } = await sb
    .from("audit_log")
    .select("created_at, metadata")
    .eq("action", "instruction_discontinued")
    .eq("entity_id", patientId);
  return (
    (data ?? []) as {
      created_at: string;
      metadata: { task_key?: string } | null;
    }[]
  ).flatMap((r) =>
    r.metadata?.task_key
      ? [{ task_key: r.metadata.task_key, created_at: r.created_at }]
      : [],
  );
}

const keys = (ts: NurseTask[]) => ts.map((t) => instructionKey(t.task)).sort();
const same = (a: string[], b: string[]) =>
  JSON.stringify(a) === JSON.stringify(b);

let fail = 0;
const report = (bed: string, name: string, ok: boolean, detail = "") => {
  console.log(
    `${ok ? "PASS" : "FAIL"} [${bed}] ${name}${detail ? ` — ${detail}` : ""}`,
  );
  if (!ok) fail++;
};

async function main(): Promise<void> {
  const { data: patients } = await sb
    .from("patients")
    .select("id, bed_number, full_name")
    .order("bed_number");

  for (const p of patients ?? []) {
    const notes = await loadNotes(p.id);
    const baseline = computeWatchFor(notes, await loadStops(p.id));
    if (baseline.length === 0) {
      report(p.bed_number, "has instructions to test", false, "watchFor empty");
      continue;
    }
    const target = baseline[0];
    const targetKey = instructionKey(target.task);

    // 2. Real discontinue row (exactly what the server action inserts, + tag).
    const { error: insErr } = await sb.from("audit_log").insert({
      actor_role: "doctor",
      action: "instruction_discontinued",
      entity_type: "patient",
      entity_id: p.id,
      metadata: {
        patient_id: p.id,
        task_key: targetKey,
        task: target.task,
        role: "doctor",
        sandbox_test: true,
      },
    });
    if (insErr) {
      report(p.bed_number, "insert discontinue", false, insErr.message);
      continue;
    }

    const afterStop = computeWatchFor(notes, await loadStops(p.id));
    report(
      p.bed_number,
      "discontinued instruction hidden",
      !keys(afterStop).includes(targetKey),
    );
    report(
      p.bed_number,
      "other instructions untouched",
      same(
        keys(afterStop),
        keys(baseline).filter((k) => k !== targetKey),
      ),
    );

    // 3. Revival — a newer note re-ordering the same instruction (in-memory:
    // dispatching real notes for every patient would pollute the demo ward).
    const revived = computeWatchFor(
      [
        {
          nurse_tasks: [target],
          confirmed_at: new Date(Date.now() + 1000).toISOString(),
        } as ClinicalNote,
        ...notes,
      ],
      await loadStops(p.id),
    );
    report(p.bed_number, "re-order revives", keys(revived).includes(targetKey));

    // 4. Cleanup: remove ONLY this run's tagged rows, then confirm restoration.
    const { error: delErr } = await sb
      .from("audit_log")
      .delete()
      .eq("action", "instruction_discontinued")
      .eq("entity_id", p.id)
      .eq("metadata->>sandbox_test", "true");
    if (delErr) {
      report(p.bed_number, "cleanup", false, delErr.message);
      continue;
    }
    const restored = computeWatchFor(notes, await loadStops(p.id));
    report(
      p.bed_number,
      "baseline restored after cleanup",
      same(keys(restored), keys(baseline)),
    );
  }

  console.log(fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
