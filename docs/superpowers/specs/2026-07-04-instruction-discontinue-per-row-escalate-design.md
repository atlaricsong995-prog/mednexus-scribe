# Special Instructions — discontinue + per-instruction escalate

**Date:** 2026-07-04
**Status:** Design approved (user), pending spec review
**Scope:** Two small closed-loop additions to the Special Instructions panel. No migration, no schema change, no new subsystem. MVP principle (user-stated): keep the loop closed with the smallest possible change.

## Problem

1. **Instructions only accumulate.** `watchFor` aggregates qualifying `nurse_tasks` from the current note **plus every archived note** (carry-forward by design), so a standing instruction that ever appeared can never be removed. A long stay turns the panel into a junk drawer, and there is no clinical "stop this order" action.
2. **Escalation has no context.** The panel-level *Escalate to attending* button sends only "Escalation from Bed X". When a specific instruction fires (wound swelling observed), the attending cannot tell **which** order triggered the escalation.

Decisions locked with the user:
- Discontinue is **attending-doctor-only** (symmetric with ordering authority; MO deliberately has no button).
- **One-tap, no reason field** — the append-only audit row (who + when) is the accountability; a two-step inline confirm guards against mis-taps.
- Med-change and "directly add a special instruction" need **no build**: both already work via dictating/typing a new note → dispatch (extraction populates `conditions`; `qualifies()` admits it), and re-dispatch supersedes pending med cells.

## Workstream A — Discontinue an instruction (doctor only)

**Identity.** A watch-for item has no row ID (it is aggregated + deduped). Its identity **is** the dedup key already used in `getPatientWindowData`: `task.trim().toLowerCase()`. The discontinue event records this `task_key`.

**Write path.** New server action `discontinueInstruction(patientId, taskKey, taskLabel)` in `src/app/patient/actions.ts` (next to `escalateToAttending`, same shape):
- RBAC: `getRole() === "doctor"` or refuse.
- Insert into `audit_log`: `action: "instruction_discontinued"`, `entity_type: "patient"`, `entity_id: patientId`, `metadata: { patient_id, task_key, task: taskLabel, role }`. Append-only; nothing is ever mutated or deleted.

**Read path / effect.** In `getPatientWindowData` (`src/lib/server/patient-window-data.ts`), before the aggregation loop, fetch that patient's discontinue events (`action = 'instruction_discontinued'`, `entity_id = patientId`; keep **latest `created_at` per `task_key`**). During aggregation, exclude a task when a discontinue event for its key is **newer than the `confirmed_at` of the note contributing it**.

**Revival rule (the closed-loop part).** The timestamp comparison above makes re-ordering work with zero extra code: if the doctor later dispatches a new note containing the same instruction, that note's `confirmed_at` postdates the discontinue event, so the instruction reappears. New order beats old stop — same supersede semantics as medication changes.

**UI.** In `patient-window.tsx`'s watch-for list, when `role === "doctor"`, each row gets a small "Discontinue" text button (new tiny client component `discontinue-instruction-button.tsx`):
- Two-step confirm on the same button: first tap → button turns destructive-red "Confirm discontinue?"; second tap fires the action. A click elsewhere / timeout (~4s) resets to step one. No dialog, no text input.
- On success: toast + `router.refresh()` so the server-recomputed list drops the row. Keyed by patient + task key so state cannot leak across bed switches (same lesson as EscalateButton).

## Workstream B — Per-instruction escalate (context-bearing)

**Reuse, don't build.** `escalateToAttending(patientId, message)` already accepts a custom message and the attending inbox already renders it in realtime. The whole feature is a message change plus a per-row entry point.

- `EscalateButton` gains an optional `context?: string` prop. Message becomes `` `Bed ${bedNumber} — ${context}` `` when provided (falls back to today's `Escalation from Bed ${bedNumber}`). Context = the instruction's `task`, plus ` (watch: ${conditions})` when conditions exist.
- Each watch-for row renders a compact (icon-size) EscalateButton for the existing `canEscalate` roles (nurse / head nurse / MO). Done-state is per row (component instance keyed by patient + task key), one-way: sent stays sent.
- The **panel-level generic button stays** — it serves escalations unrelated to any listed instruction.

## Non-goals (explicitly out)

- Reason field on discontinue; MO propose-discontinue approval flow; discontinued-history UI (strike-through list) — audit_log holds the trace, enough for MVP.
- Any change to med-change flow, extraction, dispatch, or obs routing.
- New tables / migrations; realtime push of discontinues to *other* open tabs (next server render picks it up; acceptable for demo).

## Touch points

| File | Change |
|---|---|
| `src/app/patient/actions.ts` | add `discontinueInstruction` server action (RBAC + audit_log insert) |
| `src/lib/server/patient-window-data.ts` | fetch discontinue events; timestamp-aware exclusion in the watchFor loop |
| `src/components/patient-window.tsx` | per-row Discontinue (doctor) + per-row EscalateButton (canEscalate roles) |
| `src/components/escalate-button.tsx` | optional `context` prop + compact variant |
| `src/components/discontinue-instruction-button.tsx` | new: two-step confirm button |

## Error handling

- Server action returns `{ ok, error }` like `escalateToAttending`; client toasts destructive on failure and leaves the row untouched.
- Non-doctor calling the action (crafted request) is refused server-side, not just hidden client-side.
- Duplicate discontinue of the same key is harmless (append-only; latest event wins).

## Testing / verification

- `pnpm tsc --noEmit` + lint. **No `next build`** (user's dev server is live).
- Sandbox E2E: dictate/type a conditional instruction ("check wound for swelling; notify immediately if swollen") → dispatch → appears in Special Instructions with amber watch-for box → nurse taps that row's escalate → attending inbox shows `Bed X — Check wound…` in realtime → doctor taps Discontinue → confirm → row disappears; audit_log has the event → doctor dispatches a new note re-ordering the same instruction → row revives.
- Bed-switch state check: half-confirmed discontinue and sent-escalate state must not follow the user to another patient.
