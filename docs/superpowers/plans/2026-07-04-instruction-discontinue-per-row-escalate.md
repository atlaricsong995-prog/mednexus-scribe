# Special Instructions — Discontinue + Per-Row Escalate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attending-only one-tap (two-step confirm) discontinue for Special Instructions with new-order revival, plus a per-instruction context-bearing escalate button.

**Architecture:** Extract the `watchFor` aggregation from `patient-window-data.ts` into a pure `computeWatchFor` helper that also applies discontinue exclusion (latest `instruction_discontinued` audit event newer than the newest note carrying the order → hidden; a later re-order revives). Discontinue writes an append-only `audit_log` row via a new server action. Per-row escalate reuses the existing `escalateToAttending` action with a context message.

**Tech Stack:** Next.js App Router (server components + server actions), Supabase (service-role admin client, `audit_log` table), TypeScript. Sandbox verification via `node --experimental-strip-types` (repo pattern: `supabase/seed_baseline_records.ts`).

## Global Constraints

- **NEVER run `next build`** — the user's `next dev` is live; typecheck with `pnpm exec tsc --noEmit` only.
- **No migrations, no schema changes** — reuse `audit_log` exactly as `escalation` / `break_glass_view` do.
- Discontinue RBAC: **`role === "doctor"` only**, enforced **server-side** in the action (not just hidden in UI).
- No reason field on discontinue (user decision); audit row records who + when.
- Append-only: never update/delete clinical rows. The live verifier may delete **only** its own audit rows tagged `metadata.sandbox_test: true`.
- Run all commands from `/Users/atlaric/Desktop/Claude/mednexus-scribe`.
- Scratchpad for throwaway test files: `/private/tmp/claude-501/-Users-atlaric-Desktop-Claude-mednexus-scribe/0217f082-4024-4320-b142-30c3ea62b7a5/scratchpad` (referred to as `$SCRATCH` below — substitute literally; it is not an exported env var).
- Verification must cover **ALL seeded patients** (user requirement), discovered dynamically from the `patients` table — no hardcoded beds.
- UI copy in English, matching existing panel tone.

---

### Task 1: Pure `computeWatchFor` helper (+ fixture tests)

**Files:**
- Create: `src/lib/clinical/watch-for.ts`
- Modify: `src/lib/clinical/obs-routing.ts:25` (alias import → relative, so the module chain runs under plain `node --experimental-strip-types`; `src/lib/clinical/vocab.ts` has zero imports, so the chain ends there)
- Test: `$SCRATCH/watch-for.test.ts`

**Interfaces:**
- Consumes: `isGridSpecialInstruction(task: NurseTask): boolean` from `./obs-routing`; types `ClinicalNote`, `NurseTask` from `../supabase/types`.
- Produces (used by Tasks 2, 3, 5, 6):
  - `instructionKey(task: string): string`
  - `interface DiscontinueEvent { task_key: string; created_at: string }`
  - `computeWatchFor(notes: ReadonlyArray<Pick<ClinicalNote, "nurse_tasks" | "confirmed_at"> | null>, discontinued?: ReadonlyArray<DiscontinueEvent>): NurseTask[]`

- [ ] **Step 1: Relativize the obs-routing import**

In `src/lib/clinical/obs-routing.ts` line 25, change:

```ts
import { DEFAULT_ROUTINE, isObsType, type ObsType } from "@/lib/clinical/vocab";
```

to:

```ts
import { DEFAULT_ROUTINE, isObsType, type ObsType } from "./vocab";
```

(The `import type { NurseTask } from "@/lib/supabase/types"` on the next line is type-only — stripped at runtime — leave it.)

- [ ] **Step 2: Write the failing fixture test**

Create `$SCRATCH/watch-for.test.ts` (absolute-path imports are valid ESM specifiers; `.ts` extension required under strip-types):

```ts
// Pure fixtures for computeWatchFor — run:
//   node --experimental-strip-types $SCRATCH/watch-for.test.ts
import {
  computeWatchFor,
  instructionKey,
  type DiscontinueEvent,
} from "/Users/atlaric/Desktop/Claude/mednexus-scribe/src/lib/clinical/watch-for.ts";
import type { NurseTask } from "/Users/atlaric/Desktop/Claude/mednexus-scribe/src/lib/supabase/types.ts";

const task = (over: Partial<NurseTask>): NurseTask => ({
  task: "Check wound for swelling",
  when: "each shift",
  conditions: "Notify immediately if swollen",
  priority: "normal",
  obs_type: null,
  ...over,
});
const note = (confirmed_at: string | null, tasks: NurseTask[]) => ({
  confirmed_at,
  nurse_tasks: tasks,
});
const stop = (task_key: string, created_at: string): DiscontinueEvent => ({
  task_key,
  created_at,
});
const keys = (ts: NurseTask[]) => ts.map((t) => instructionKey(t.task));

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}` +
      (ok ? "" : ` — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`),
  );
  if (!ok) fail++;
};

const WOUND = "check wound for swelling";
const T0 = "2026-07-04T08:00:00Z"; // note confirmed
const T1 = "2026-07-04T09:00:00Z"; // discontinue after T0
const T2 = "2026-07-04T10:00:00Z"; // re-order after T1
const T3 = "2026-07-04T11:00:00Z"; // second stop after T2

// 1. Conditional task qualifies.
check("conditional qualifies", keys(computeWatchFor([note(T0, [task({})])])), [WOUND]);

// 2. Plain task (normal priority, no conditions, not a grid vital) is excluded.
check(
  "non-qualifying excluded",
  keys(computeWatchFor([note(T0, [task({ task: "Change dressing", conditions: null })])])),
  [],
);

// 3. High priority qualifies even without conditions.
check(
  "high priority qualifies",
  keys(computeWatchFor([note(T0, [task({ task: "Neuro obs", conditions: null, priority: "high" })])])),
  ["neuro obs"],
);

// 4. Recurring grid vital qualifies via isGridSpecialInstruction (proves the
//    obs-routing chain loads at runtime).
check(
  "grid special qualifies",
  keys(
    computeWatchFor([
      note(T0, [task({ task: "SpO2 monitoring", when: "Q2H", conditions: null, obs_type: "spo2" })]),
    ]),
  ),
  ["spo2 monitoring"],
);

// 5. Dedup across notes — newest-first occurrence wins, listed once.
check(
  "dedup across notes",
  keys(computeWatchFor([note(T2, [task({})]), note(T0, [task({ task: " CHECK Wound for swelling " })])])),
  [WOUND],
);

// 6. Discontinue after the newest carrying note hides the instruction.
check("discontinued hidden", keys(computeWatchFor([note(T0, [task({})])], [stop(WOUND, T1)])), []);

// 7. Re-order after the discontinue revives it (new order beats old stop).
check(
  "re-order revives",
  keys(computeWatchFor([note(T2, [task({})]), note(T0, [task({})])], [stop(WOUND, T1)])),
  [WOUND],
);

// 8. Latest discontinue wins: stop → re-order → stop again ⇒ hidden.
check(
  "second stop wins",
  keys(computeWatchFor([note(T2, [task({})]), note(T0, [task({})])], [stop(WOUND, T1), stop(WOUND, T3)])),
  [],
);

// 9. Null notes are skipped safely (no-current-note patients).
check("null note skipped", keys(computeWatchFor([null, note(T0, [task({})])])), [WOUND]);

// 10. Unrelated discontinue key leaves other instructions alone.
check(
  "unrelated stop ignored",
  keys(computeWatchFor([note(T0, [task({})])], [stop("some other order", T1)])),
  [WOUND],
);

// 11. Key normalisation.
check("instructionKey trims+lowers", instructionKey("  CHECK Wound "), "check wound");

console.log(fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 3: Run test to verify it fails**

Run: `node --experimental-strip-types "$SCRATCH/watch-for.test.ts"`
Expected: FAIL to load — `Cannot find module .../src/lib/clinical/watch-for.ts`

- [ ] **Step 4: Write the implementation**

Create `src/lib/clinical/watch-for.ts`:

```ts
// Pure watch-for (Special Instructions) aggregation — extracted from
// patient-window-data so the discontinue exclusion is testable without a
// Supabase client (2026-07-04 discontinue spec). Notes must be ordered
// newest-first (current note, then archived history): the first occurrence of
// a task key wins the dedup, so the discontinue comparison always runs against
// the NEWEST note carrying that order.
import { isGridSpecialInstruction } from "./obs-routing";
import type { ClinicalNote, NurseTask } from "../supabase/types";

// The aggregation dedup key doubles as the instruction's identity for
// discontinue events — instructions have no row id (they are aggregated
// across notes), so the normalised task text is the stable key.
export function instructionKey(task: string): string {
  return task.trim().toLowerCase();
}

// One instruction_discontinued audit_log row, reduced to what exclusion needs.
export interface DiscontinueEvent {
  task_key: string;
  created_at: string;
}

type WatchForNote = Pick<ClinicalNote, "nurse_tasks" | "confirmed_at">;

// Standing/special instructions carry FORWARD across note confirmations, so a
// key is hidden only while its latest discontinue postdates the newest note
// carrying it — a later re-order (fresher confirmed_at) revives the
// instruction. New order beats old stop, same supersede semantics as meds.
export function computeWatchFor(
  notes: ReadonlyArray<WatchForNote | null>,
  discontinued: ReadonlyArray<DiscontinueEvent> = [],
): NurseTask[] {
  const stoppedAt = new Map<string, number>();
  for (const d of discontinued) {
    const at = Date.parse(d.created_at);
    if (!Number.isFinite(at)) continue;
    const prev = stoppedAt.get(d.task_key);
    if (prev === undefined || at > prev) stoppedAt.set(d.task_key, at);
  }

  // Suppressed grid-vital orders (e.g. a normal-priority "SpO₂ Q2H") get no
  // task row, so Special Instructions is their ONLY home — admit them
  // regardless of priority (same rule the inline aggregation had).
  const qualifies = (t: NurseTask) =>
    !!t.conditions ||
    t.priority === "high" ||
    t.priority === "critical" ||
    isGridSpecialInstruction(t);

  const watchFor: NurseTask[] = [];
  const seen = new Set<string>();
  for (const n of notes) {
    for (const t of n?.nurse_tasks ?? []) {
      if (!qualifies(t)) continue;
      const key = instructionKey(t.task);
      if (seen.has(key)) continue;
      // Claimed by its newest occurrence even when hidden — an older note's
      // copy must not resurrect an order discontinued after the newest one.
      seen.add(key);
      const stopped = stoppedAt.get(key);
      const orderedAt = n?.confirmed_at ? Date.parse(n.confirmed_at) : 0;
      if (stopped !== undefined && stopped > orderedAt) continue;
      watchFor.push(t);
    }
  }
  return watchFor;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `node --experimental-strip-types "$SCRATCH/watch-for.test.ts"`
Expected: 11 × PASS, `ALL PASS`, exit 0.

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/clinical/watch-for.ts src/lib/clinical/obs-routing.ts
git commit -m "feat(instructions): pure computeWatchFor with discontinue exclusion + revival"
```

---

### Task 2: Wire discontinue events into `getPatientWindowData`

**Files:**
- Modify: `src/lib/server/patient-window-data.ts` (imports at top; aggregation at lines ~188–209)

**Interfaces:**
- Consumes: `computeWatchFor` + `DiscontinueEvent` from `@/lib/clinical/watch-for`.
- Produces: `PatientWindowData.watchFor` now excludes discontinued instructions (shape unchanged — `NurseTask[]`), so no consumer changes.

- [ ] **Step 1: Add the audit fetch helper**

In `src/lib/server/patient-window-data.ts`, add below `getAdHocTasks` (after line 96):

```ts
// Latest-per-key reduction happens inside computeWatchFor; this just reads the
// raw append-only discontinue events for one patient (audit_log, same channel
// escalation/break-glass use — no dedicated table).
async function getDiscontinueEvents(
  patientId: string,
): Promise<DiscontinueEvent[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("audit_log")
    .select("created_at, metadata")
    .eq("action", "instruction_discontinued")
    .eq("entity_id", patientId);
  const rows = (data ?? []) as {
    created_at: string;
    metadata: { task_key?: string } | null;
  }[];
  return rows.flatMap((r) =>
    r.metadata?.task_key
      ? [{ task_key: r.metadata.task_key, created_at: r.created_at }]
      : [],
  );
}
```

- [ ] **Step 2: Replace the inline aggregation**

Change the imports: replace

```ts
import { isGridSpecialInstruction } from "@/lib/clinical/obs-routing";
```

with

```ts
import {
  computeWatchFor,
  type DiscontinueEvent,
} from "@/lib/clinical/watch-for";
```

(`isGridSpecialInstruction` has no other use in this file — verify with a grep before deleting.)

In `getPatientWindowData`, extend the parallel load (lines ~174–179):

```ts
  const [currentNote, routineTasks, medTasks, adHocTasks, discontinued] =
    await Promise.all([
      getLatestConfirmedNote(patient.id),
      getTodayRoutineTasks(patient.id),
      getTodayMedTasks(patient.id),
      getAdHocTasks(patient.id),
      getDiscontinueEvents(patient.id),
    ]);
```

Then replace the whole block from the `// Standing/special instructions carry FORWARD…` comment through the `for` loop (lines ~188–209) with:

```ts
  // Standing/special instructions carry FORWARD across note confirmations,
  // minus doctor-discontinued orders; a later re-order revives (all the
  // aggregation + exclusion semantics live in computeWatchFor).
  const watchFor = computeWatchFor(
    [currentNote, ...fullHistory],
    discontinued,
  );
```

- [ ] **Step 3: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `node --experimental-strip-types "$SCRATCH/watch-for.test.ts"`
Expected: still `ALL PASS` (guards against accidental helper edits).

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/patient-window-data.ts
git commit -m "feat(instructions): patient window watch-for honours discontinue events"
```

---

### Task 3: `discontinueInstruction` server action (doctor-only)

**Files:**
- Modify: `src/app/patient/actions.ts` (append after `escalateToAttending`, line 93)

**Interfaces:**
- Consumes: `getRole()` from `@/lib/server/role`, `createAdminClient()` from `@/lib/supabase/admin` (both already imported in this file), `instructionKey` from `@/lib/clinical/watch-for`.
- Produces (used by Task 5's button): `discontinueInstruction(patientId: string, task: string): Promise<DiscontinueResult>` with `interface DiscontinueResult { ok: boolean; error?: string }`.

- [ ] **Step 1: Add the action**

Add to imports at the top of `src/app/patient/actions.ts`:

```ts
import { instructionKey } from "@/lib/clinical/watch-for";
```

Append at the end of the file:

```ts
// Discontinue a Special Instruction (2026-07-04 spec). Attending-only — the
// stop is symmetric with ordering authority; the MO deliberately has no path
// here. One tap, no reason field (user decision): the append-only audit row
// (who + when) is the accountability trail. computeWatchFor hides a key whose
// latest discontinue postdates the newest note carrying it, so a later
// re-order simply revives the instruction — new order beats old stop.
export interface DiscontinueResult {
  ok: boolean;
  error?: string;
}

export async function discontinueInstruction(
  patientId: string,
  task: string,
): Promise<DiscontinueResult> {
  const role = getRole();
  if (role !== "doctor") {
    return {
      ok: false,
      error: "Only the attending doctor may discontinue an instruction.",
    };
  }
  const label = task?.trim();
  if (!patientId || !label) {
    return { ok: false, error: "Missing patient or instruction." };
  }

  const supabase = createAdminClient();
  const { error } = await supabase.from("audit_log").insert({
    actor_role: role,
    action: "instruction_discontinued",
    entity_type: "patient",
    entity_id: patientId,
    metadata: {
      patient_id: patientId,
      task_key: instructionKey(label),
      task: label,
      role,
    },
  });
  if (error) {
    return { ok: false, error: `Could not discontinue: ${error.message}` };
  }
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/patient/actions.ts
git commit -m "feat(instructions): doctor-only discontinueInstruction action (append-only audit row)"
```

---

### Task 4: `EscalateButton` context message + compact variant

**Files:**
- Modify: `src/components/escalate-button.tsx` (whole component shown below)

**Interfaces:**
- Consumes: existing `escalateToAttending(patientId, message)` action (unchanged).
- Produces (used by Task 5): `<EscalateButton patientId bedNumber context? compact? />` — `context?: string` swaps the message to `` `Bed ${bedNumber} — ${context}` ``; `compact?: boolean` renders the icon-size per-row variant.

- [ ] **Step 1: Extend the component**

Replace the body of `src/components/escalate-button.tsx` from the `export function` line down (keep imports + file comment; extend the comment):

```tsx
// Escalate-to-attending button (Enh Day 4, plan point 4). Shown on the Special
// Instructions panel for nurses and residents. One tap writes an audit_log
// 'escalation' row, which the attending's /doctor inbox picks up in realtime.
// 2026-07-04: per-row usage — `context` carries the instruction text so the
// attending sees WHICH order fired ("Bed 17 — Check wound…"), and `compact`
// renders the icon-size row variant. The panel-level button (no context)
// keeps serving escalations unrelated to any listed instruction.
export function EscalateButton({
  patientId,
  bedNumber,
  context,
  compact = false,
}: {
  patientId: string;
  bedNumber: string;
  context?: string;
  compact?: boolean;
}) {
  const { toast } = useToast();
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  async function escalate() {
    setSending(true);
    try {
      const message = context
        ? `Bed ${bedNumber} — ${context}`
        : `Escalation from Bed ${bedNumber}`;
      const res = await escalateToAttending(patientId, message);
      if (!res.ok) throw new Error(res.error ?? "Escalation failed.");
      setDone(true);
      toast({
        title: "Attending notified",
        description: "Your escalation was sent to the attending doctor.",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not escalate",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSending(false);
    }
  }

  if (compact) {
    return (
      <Button
        variant="ghost"
        size="sm"
        onClick={escalate}
        disabled={sending || done}
        title={done ? "Attending notified" : "Escalate this instruction"}
        className="h-7 px-2 text-red-700 hover:bg-red-50"
      >
        {sending ? (
          <PulseLoader className="text-current" />
        ) : (
          <BellRing className="h-3.5 w-3.5" />
        )}
        {done && <span className="text-xs">Sent</span>}
        <span className="sr-only">Escalate this instruction</span>
      </Button>
    );
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={escalate}
      disabled={sending || done}
      className="border-red-300 text-red-700 hover:bg-red-50"
    >
      {sending ? (
        <PulseLoader className="text-current" />
      ) : (
        <BellRing className="h-4 w-4" />
      )}
      {done ? "Attending notified" : "Escalate to attending"}
    </Button>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors (existing panel-level call site passes no new props — both optional).

- [ ] **Step 3: Commit**

```bash
git add src/components/escalate-button.tsx
git commit -m "feat(instructions): EscalateButton context message + compact per-row variant"
```

---

### Task 5: Discontinue button component + watch-for row wiring

**Files:**
- Create: `src/components/discontinue-instruction-button.tsx`
- Modify: `src/components/patient-window.tsx` (imports; watch-for rows at lines ~284–299)

**Interfaces:**
- Consumes: `discontinueInstruction(patientId, task)` (Task 3), `EscalateButton` with `context`/`compact` (Task 4), `instructionKey` (Task 1).
- Produces: final UI. No downstream consumers.

- [ ] **Step 1: Create the two-step confirm button**

Create `src/components/discontinue-instruction-button.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";
import { discontinueInstruction } from "@/app/patient/actions";
import { useToast } from "@/hooks/use-toast";

// Doctor-only stop for one Special Instruction (2026-07-04 spec). Two-step
// confirm on the same button — no dialog, no reason field (user decision: the
// append-only audit row's who+when is the accountability; the armed state only
// guards mis-taps). On success the server-recomputed watch-for list drops the
// row via router.refresh(); re-ordering the instruction later revives it.
export function DiscontinueInstructionButton({
  patientId,
  task,
}: {
  patientId: string;
  task: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [armed, setArmed] = useState(false);
  const [sending, setSending] = useState(false);

  // A forgotten first tap must not fire minutes later — disarm after 4s.
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(t);
  }, [armed]);

  async function onClick() {
    if (!armed) {
      setArmed(true);
      return;
    }
    setSending(true);
    try {
      const res = await discontinueInstruction(patientId, task);
      if (!res.ok) throw new Error(res.error ?? "Discontinue failed.");
      toast({ title: "Instruction discontinued", description: task });
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Could not discontinue",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
      setArmed(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      disabled={sending}
      className={
        armed
          ? "h-7 px-2 text-xs font-semibold text-red-700 hover:bg-red-50"
          : "h-7 px-2 text-xs text-slate-500 hover:text-red-700"
      }
    >
      {sending ? (
        <PulseLoader className="text-current" />
      ) : armed ? (
        "Confirm discontinue?"
      ) : (
        "Discontinue"
      )}
    </Button>
  );
}
```

- [ ] **Step 2: Wire the watch-for rows**

In `src/components/patient-window.tsx`, add imports:

```tsx
import { DiscontinueInstructionButton } from "@/components/discontinue-instruction-button";
import { instructionKey } from "@/lib/clinical/watch-for";
```

Replace the `watchFor.map((t, i) => (…))` block (lines ~284–299) with:

```tsx
            watchFor.map((t) => (
              // Row key includes the patient: the master-detail layout reuses
              // this component instance across bed switches, and two patients
              // can carry the same baseline instruction text — child state
              // (escalate done, discontinue armed) must not leak between them.
              <div
                key={`${patient.id}|${instructionKey(t.task)}`}
                className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-slate-800">{t.task}</p>
                  <div className="flex shrink-0 items-center gap-1">
                    {canEscalate && (
                      <EscalateButton
                        patientId={patient.id}
                        bedNumber={patient.bed_number}
                        context={
                          t.conditions
                            ? `${t.task} (watch: ${t.conditions})`
                            : t.task
                        }
                        compact
                      />
                    )}
                    {role === "doctor" && (
                      <DiscontinueInstructionButton
                        patientId={patient.id}
                        task={t.task}
                      />
                    )}
                  </div>
                </div>
                {t.conditions && (
                  <p className="mt-0.5 rounded bg-amber-50 px-2 py-1 text-xs text-amber-800">
                    Watch for: {t.conditions}
                  </p>
                )}
                {t.when && (
                  <p className="mt-0.5 text-xs text-slate-500">{t.when}</p>
                )}
              </div>
            ))
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm lint`
Expected: no new warnings/errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/discontinue-instruction-button.tsx src/components/patient-window.tsx
git commit -m "feat(instructions): per-row escalate + doctor discontinue on Special Instructions"
```

---

### Task 6: Live all-patients verification (committed script) + cleanup

**Files:**
- Create: `supabase/verify_watchfor_discontinue.ts` (committed, like `seed_baseline_records.ts` — rerunnable before demos)

**Interfaces:**
- Consumes: `computeWatchFor`, `instructionKey`, `DiscontinueEvent` via relative import `../src/lib/clinical/watch-for.ts`; live Supabase via `.env.local` (same bootstrap as `seed_baseline_records.ts`).
- Produces: PASS/FAIL per patient on stdout; exit 1 on any failure; leaves **zero** residue (deletes only rows it inserted, tagged `sandbox_test`).

- [ ] **Step 1: Write the verifier**

Create `supabase/verify_watchfor_discontinue.ts`:

```ts
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
  return ((data ?? []) as {
    created_at: string;
    metadata: { task_key?: string } | null;
  }[]).flatMap((r) =>
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
  console.log(`${ok ? "PASS" : "FAIL"} [${bed}] ${name}${detail ? ` — ${detail}` : ""}`);
  if (!ok) fail++;
};

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
    same(keys(afterStop), keys(baseline).filter((k) => k !== targetKey)),
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
  report(p.bed_number, "baseline restored after cleanup", same(keys(restored), keys(baseline)));
}

console.log(fail === 0 ? "ALL PASS" : `${fail} FAILURE(S)`);
process.exit(fail === 0 ? 0 : 1);
```

- [ ] **Step 2: Run it against the live ward**

Run: `node --experimental-strip-types supabase/verify_watchfor_discontinue.ts`
Expected: 5 PASS lines per patient (hidden / untouched / revives / cleanup implicit in restore / restored) for **every** bed, ending `ALL PASS`, exit 0. If any patient reports `watchFor empty`, run `node --experimental-strip-types supabase/seed_baseline_records.ts` first, then re-run.

- [ ] **Step 3: Typecheck + fixture regression**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `node --experimental-strip-types "$SCRATCH/watch-for.test.ts"`
Expected: `ALL PASS`.

- [ ] **Step 4: Commit**

```bash
git add supabase/verify_watchfor_discontinue.ts
git commit -m "test(instructions): live all-patients discontinue/revival verifier"
```

- [ ] **Step 5: Manual UI walkthrough checklist (report to user; user's dev server)**

Not automatable here — hand the user this list (Script-style, doctor tab + nurse tab):
1. Doctor on any bed: each Special Instruction row shows "Discontinue"; first tap → red "Confirm discontinue?", waiting 4s resets it; second tap → toast + row disappears.
2. Nurse tab same bed (realtime/refresh): row gone; nurse rows show the bell, tapping sends; doctor `/doctor` inbox shows `Bed X — <instruction> (watch: …)`.
3. Nurse/MO see no Discontinue button; doctor sees no per-row bell.
4. Doctor dictates/types a new note re-ordering the discontinued instruction → dispatch → row is back.
5. Bed switch mid-arm: arm a Discontinue, switch beds — the other patient's rows are un-armed.
