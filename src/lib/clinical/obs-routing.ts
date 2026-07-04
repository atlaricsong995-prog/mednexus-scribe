// Observation routing (Workstream B) — deterministic, NO LLM (mirrors lib/safety.ts).
//
// Three homes for a dictated observation (obs-routing redesign, 2026-07-03):
//   Routine timetable    = the universal standing vitals grid (bp/hr/temp/spo2, q4h)
//                          every patient already has — the nurse charts HERE.
//   Special Instructions = standing patient-specific watch orders on those same grid
//                          vitals (denser cadence "SpO₂ Q2H", tighter thresholds,
//                          escalation conditions) — display-only; NO task row, the
//                          reading still lands in the grid.
//   Outstanding tasks    = execute-once items: complete → gone.
//
// So for extracted nurse_tasks this module suppresses:
//
//   * grid vital, plain / recurring cadence / conditional -> SUPPRESS (grid charts it;
//                                                            Special Instructions shows
//                                                            the standing order)
//   * grid vital tied to a one-off EVENT ("BP 1h after     -> keep (a real execute-once
//     dose", "once", "stat")                                  task)
//   * non-grid observation (glucose, rr)                   -> keep (task list is its
//                                                              only chartable home)
//   * standing WATCH order (conditions, not chartable,     -> SUPPRESS (Special
//     no one-off event anchor) — "monitor wound, escalate     Instructions is its home;
//     if swollen" (2026-07-04)                                a tickable task misreports
//                                                             a continuous order as done)
//   * non-observation tasks (procedures, etc.)             -> keep
//
// Suppression only removes the redundant task ROW; the doctor's authored nurse_tasks
// list on the note is untouched.
import { DEFAULT_ROUTINE, isObsType, type ObsType } from "./vocab.ts";
import type { NurseTask } from "@/lib/supabase/types";

// Keyword fallback so we can still detect a routine vital when Gemini didn't tag
// obs_type. Only the routine grid vitals matter here (glucose/rr are never suppressed).
const ROUTINE_OBS_KEYWORDS: Record<Exclude<ObsType, "glucose" | "rr">, RegExp> = {
  bp: /\b(bp|blood pressure)\b/i,
  hr: /\b(hr|heart rate|pulse)\b/i,
  temp: /\b(temp|temperature)\b/i,
  spo2: /\b(spo2|sats?|oxygen saturation|o2 sats?)\b/i,
};

// Detect which routine vital (if any) a task refers to — obs_type wins, text is a
// fallback. Returns null for non-routine observations and non-observations.
function detectRoutineObs(task: NurseTask): ObsType | null {
  if (
    isObsType(task.obs_type) &&
    (DEFAULT_ROUTINE as ObsType[]).includes(task.obs_type)
  ) {
    return task.obs_type;
  }
  // Only fall back to text when obs_type is absent (don't override an explicit tag).
  if (!task.obs_type) {
    for (const [obs, re] of Object.entries(ROUTINE_OBS_KEYWORDS)) {
      if (re.test(task.task)) return obs as ObsType;
    }
  }
  return null;
}

// A recurring cadence ("q2h", "hourly", "QDS", "every 2 hours") is a STANDING order —
// the nurse keeps charting in the grid at that rhythm, guided by Special Instructions.
// Checked BEFORE the one-off regex so "every 2 hours" isn't misread as event timing.
const RECURRING_WHEN =
  /\b(q\s?\d+\s?h|hourly|every\s+\d+\s*(?:min(?:ute)?|h(?:ou)?r)s?|od|bd|bid|tds|tid|qds|qid|daily|nocte|continuous)\b/i;

// A one-off EVENT anchor ("1 hour after dose", "before transfer", "once", "stat")
// means a single measurement someone must remember to execute — that's a real task.
const ONE_OFF_WHEN =
  /\b(after|post|pre|before|prior|following|once|stat|now)\b|\b(?:in\s+)?\d+\s*(?:min(?:ute)?|h(?:ou)?r)s?\b/i;

// True when the `when` reads as a recurring cadence rather than a one-off event.
// Dispatch also uses this to fan non-grid observations out per-occurrence.
export function isRecurringWhen(when: string | null | undefined): boolean {
  const w = (when ?? "").trim();
  return !!w && RECURRING_WHEN.test(w);
}

// True when the task is a routine grid vital whose home is the timetable + Special
// Instructions — plain cadence, recurring cadence, or a standing condition. It should
// NOT be materialised as a worklist task. Only a one-off event-timed measurement
// ("BP 1 hour after dose") escapes: that is a genuine execute-once task.
export function isRoutineCovered(task: NurseTask): boolean {
  if (detectRoutineObs(task) === null) return false;
  const w = (task.when ?? "").trim();
  if (isRecurringWhen(w)) return true; // standing cadence -> Special Instructions
  if (ONE_OFF_WHEN.test(w)) return false; // event-timed one-off -> keep as task
  return true; // plain routine (with or without conditions) -> grid covers it
}

// Suppressed grid vitals that still carry patient-specific content (a cadence, a
// timing note, or an escalation condition) must surface in Special Instructions —
// otherwise suppressing the task would erase the order from both places. A bare
// "monitor vitals" (no when, no conditions) adds nothing over the grid and stays out.
export function isGridSpecialInstruction(task: NurseTask): boolean {
  if (!isRoutineCovered(task)) return false;
  return !!(task.when?.trim() || task.conditions?.trim());
}

// A condition-gated pure notification ("Notify doctor if BSL > 10") orders no
// measurable action — there is nothing to chart or complete against it, even
// when the extractor tags an obs_type because the text names a vital.
const NOTIFY_ONLY = /^(notify|escalate|inform|alert|call|contact)\b/i;

// A standing WATCH order — "monitor the wound, escalate if swollen", "notify
// doctor if BSL > 10" — is a continuous state of alertness, not an
// execute-once item: a task row the nurse can tick "done" would misreport the
// order as finished, so Special Instructions is its ONLY home (2026-07-04,
// mirrors the grid-vital rule). Deliberately narrower than the watch-for
// qualifier: suppression must only remove tasks Special Instructions will
// actually show, so it requires an explicit condition ("dressing change
// daily" has none, would vanish from both homes, and stays a task).
// Chartable measurement orders (obs_type set and actually asking for a
// reading — glucose QDS fan-out, "BSL stat") keep their rows: each reading is
// genuinely completable. A one-off event anchor ("check wound 1 hour
// post-op") is a real task too.
export function isStandingWatchOnly(task: NurseTask): boolean {
  if (!task.conditions?.trim()) return false;
  // Condition-gated notifications are watches regardless of obs_type or when.
  if (NOTIFY_ONLY.test(task.task.trim())) return true;
  if (task.obs_type) return false;
  return !ONE_OFF_WHEN.test((task.when ?? "").trim());
}
