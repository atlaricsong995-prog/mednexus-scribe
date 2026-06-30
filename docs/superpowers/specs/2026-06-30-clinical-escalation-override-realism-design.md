# Clinical realism round — escalation, override gate, observation routing

**Date:** 2026-06-30
**Status:** Design approved, pending spec review
**Scope:** Four logic fixes surfaced while testing *MVP Full Test Script* Script A. Realism polish on top of the round-3 nurse-view work. No new subsystems.

## Problem

Testing exposed four clinical-logic gaps:

1. **Abnormal vitals go nowhere.** A scheduled measurement that breaches its range only turns red; nobody is notified. Clinically, a dangerous value must reach a clinician.
2. **Allergy override needs no justification.** A doctor can prescribe a drug the patient is allergic to, tick the override box, and dispatch with **no reason** — so the nurse sees a flagged drug with no rationale and just proceeds.
3. **Glucose modelled as if routine.** Blood glucose is patient-/medication-specific (e.g. fasting, post-insulin), not a fixed q4h vital. It belongs in Special Instructions with an explicit threshold, not in the universal grid.
4. **BP over-specified.** BP is already a routine grid vital, so the extractor should not manufacture a separate heavyweight BP task — unless there is special timing/condition (e.g. "BP 1h post-antihypertensive"), which is a Special Instruction.

## Guiding taxonomy (the unifying decision)

- **Routine timetable** = the universal standing vitals set (`bp / hr / temp / spo2`, q4h), identical for every patient.
- **Special Instructions** = patient-specific, conditional, or specially-timed orders (glucose QDS, post-med BP, "watch for X"). Each carries an explicit threshold/condition and an escalate affordance.
- **Escalation** = when any charted value enters the **critical** band, the system auto-notifies the attending (severity-based routing, not time-of-day).

This taxonomy already matches the codebase: routine grid is `DEFAULT_ROUTINE`, Special Instructions is `watchFor` (derived from `nurse_tasks` with `conditions`/high-priority), glucose is deliberately excluded from the routine grid.

---

## Workstream A — Mandatory override reason (point 2)

**Current state.** Backend already accepts and logs `override.reason` (`/api/dispatch` writes `override_reason` into `audit_log`). The gap is purely UI: `confirm-button.tsx` only requires the acknowledge checkbox; the reason textarea is labelled *"optional"*.

**Change.**
- `confirm-button.tsx`: when `hasCritical`, keep dispatch **blocked until the reason is non-empty** — `blocked = hasCritical && (!acknowledged || !reason.trim())`. Relabel placeholder to *"Reason required for override"*.
- Scope: **critical flags only** (allergy). Warning flags (dose ceiling, duplicate class) keep an optional reason — don't gate every yellow flag.
- **Close the loop to the nurse:** propagate the doctor's `override_reason` onto the nurse's MAR badge. Today the badge shows `safety_alert` = *why the drug is dangerous*; add the doctor's *why I proceeded anyway*. This is what makes the override meaningful to the nurse rather than a silent red flag.

**Touch points.**
- `src/components/confirm-button.tsx` — gate + label.
- `src/app/api/dispatch/route.ts` — already records `override_reason`; additionally stamp it onto the dispatched medication task cells (alongside the existing `safety_alert`) so the nurse view can render it.
- Nurse MAR badge component (`medication-timetable.tsx` / `med-administer-dialog.tsx`) — show the override reason.

---

## Workstream B — Observation routing (points 3 + 4)

A deterministic classifier (no LLM, mirroring `lib/safety.ts`) decides where each extracted `nurse_task` observation lands:

| Dictated observation | Destination |
|---|---|
| Matches a routine vital (`bp/hr/temp/spo2`) **and has no special timing/condition** | **Suppress** — already covered by the routine grid; do not create a separate task |
| Matches a routine vital **with** special timing/condition (e.g. "BP 1h post-dose") | **Special Instruction** (`nurse_tasks` row with `when` + `conditions`) |
| Non-routine observation (glucose, etc.) | **Special Instruction** (standing-order header) **+** a chartable ad-hoc obs task |

**Glucose charting decision (resolved):** glucose values are charted through the **existing ad-hoc obs-task mechanism** — a `tasks` row with `obs_type='glucose'` completed via the existing `CompletionDialog` (fixed-unit input + range check). The Special Instruction is the human-readable standing order + threshold; it is not a new grid row. Rationale: reuses all existing charting/range-check plumbing; a patient-specific grid row would need new materialisation for marginal demo value. This also preserves the vocab's existing "glucose = one-off abnormal value" demo hook.

**Classifier heuristic (demo-scoped):** keyword-match the task text against `OBSERVATION_CATALOG` labels/aliases to detect the obs type; treat presence of timing/condition language (`when` populated, or `conditions` populated, or phrases like "after", "post", "if", "1 hour", "QDS at...") as "special". A routine-vital obs with neither is the suppressible case.

**Touch points.**
- `src/lib/clinical/vocab.ts` or a new `src/lib/clinical/obs-routing.ts` — the classifier helper + unit tests.
- `src/app/api/dispatch/route.ts` — apply the classifier when fanning out `nurse_tasks`; suppress routine-covered obs, route the rest.

---

## Workstream C — Two-band thresholds + auto-escalation (points 1 + 3)

The one new mechanic. Small, and shared by grid cells and special-instruction obs alike.

**1. Add a `critical` band to `OBSERVATION_CATALOG`.** A wider outer bound than the existing `normal` range; a value outside it is *critical* (vs. merely *abnormal*). Examples:

- `glucose`: normal `[4,10]`, critical outside `[3,20]` (i.e. `<3` or `>20`)
- `bp`: critical systolic `>180` or `<80`
- `spo2`: critical `<90`
- `temp`: critical `>39.5`

Represented consistently with the existing structure: `critical?: [number,number]` on `ObsSingle`; `criticalSystolic?` / `criticalDiastolic?` on `ObsBp`. Items without a `critical` band never auto-escalate.

**2. Two-band evaluation on completion.** Add a severity helper beside `isAbnormal`:

- outside `normal` → `abnormal = true` (renders red, **no notification** — avoids alert fatigue on mild deviations). Unchanged behaviour.
- outside `critical` → in addition, **fire an auto-escalation**.

**3. Auto-escalation = an `audit_log` row** with `action='escalation'`, `metadata` carrying `{ obs_type, value, slot/scheduled_for, severity:'critical', patient_id, bed }`. This reuses the **existing** escalation channel: `getRecentAlerts` already backfills `action='escalation'` and the attending `/doctor` inbox already subscribes via realtime. No new inbox, no schema change beyond reusing `audit_log`.

**4. Routing = severity-based, single target (attending).** Per the chosen model: any critical value escalates to the attending inbox. Not time-of-day branched (demo-deterministic). The existing manual **Escalate to attending** button stays as a backup/explicit path.

**5. Unified across sources.** The same severity check runs whether the value came from a routine grid cell (`routine_key`) or a chartable glucose obs task — both flow through `/api/tasks/[id]/complete`, so the escalation logic lives there once.

**6. Threshold source (explicit).** Auto-escalation fires off the **catalog `critical` band**, not the free-text threshold a clinician may dictate ("escalate if <4 or >15"). The dictated threshold is rendered as Special-Instruction display text for the human; the deterministic escalation uses the catalog band. Demo simplification — we don't parse arbitrary dictated thresholds into executable rules. Catalog bands are tuned so the demo script's values land critical.

**Touch points.**
- `src/lib/clinical/vocab.ts` — `critical` bands + `obsSeverity()` (or `isCritical()`) helper.
- `src/app/api/tasks/[id]/complete/route.ts` — after computing `abnormal`, compute critical; if critical, insert the `escalation` audit_log row.
- Nurse/grid UI may optionally distinguish critical (deeper red / icon) from abnormal — nice-to-have, not required.

---

## Out of scope (YAGNI)

- Time-of-day escalation routing (night→MO, day→attending). Considered and rejected: clock-dependent branches are fragile to demo and add little over severity routing.
- A scheduler / future-day routine or glucose grid rows.
- Escalation acknowledgement workflow (attending marking an alert handled). The inbox surfacing is enough for the demo loop.
- Changing the LLM extraction prompt for routing — classification is deterministic and post-extraction.

## Success criteria

1. Dispatching a note with a critical allergy flag is **impossible** until a non-empty override reason is entered; that reason appears on the nurse's MAR badge.
2. A dictated "check BG QDS, escalate if <4 or >15" surfaces as a **Special Instruction** with threshold, plus a chartable glucose obs task; a dictated plain "monitor BP" produces **no** extra task (grid covers it); a dictated "BP 1h post-dose" surfaces as a Special Instruction.
3. Charting a glucose of `2.5` (or a routine BP of `200/120`) auto-writes an `escalation` row that appears in the attending `/doctor` inbox in realtime; charting a mildly-abnormal value turns red but does **not** escalate.
4. `tsc --noEmit` and lint clean; no schema migration required beyond reuse of existing columns/`audit_log`.
