// Observation routing (Workstream B) — deterministic, NO LLM (mirrors lib/safety.ts).
//
// The routine timetable already charts the universal standing vitals (bp/hr/temp/
// spo2, q4h) for every patient. So a dictated observation that is just one of those
// vitals on its routine cadence is ALREADY covered by the grid — materialising it as
// a separate worklist task is redundant noise. This module decides which extracted
// nurse_tasks to suppress from materialisation:
//
//   * routine vital + no special timing/condition  -> SUPPRESS (grid covers it)
//   * routine vital WITH special timing/condition   -> keep (Special Instruction, e.g.
//                                                      "BP 1h post-antihypertensive")
//   * non-routine observation (glucose, etc.)       -> keep (chartable + Special Instr.)
//   * non-observation tasks (procedures, etc.)      -> keep
//
// Suppression only removes the redundant task ROW; the doctor's authored nurse_tasks
// list on the note is untouched.
import { DEFAULT_ROUTINE, isObsType, type ObsType } from "@/lib/clinical/vocab";
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

// A `when` is "special" when it ties the observation to an event or condition rather
// than a plain routine cadence (q4h / qds / bd / daily / routine). Event/conditional
// language ("after", "post", "1 hour", "if", "stat") means it belongs in Special
// Instructions, not the grid.
const SPECIAL_WHEN =
  /\b(after|post|pre|before|prior|following|once|if|when|stat|now|hourly|q1h|q2h|\d+\s*(min|minute|hour|hr))\b/i;

function hasSpecialTiming(when: string | null | undefined): boolean {
  const w = (when ?? "").trim();
  if (!w) return false;
  return SPECIAL_WHEN.test(w);
}

// True when the task is a routine grid vital on its routine cadence — redundant with
// the timetable, so it should NOT be materialised as a separate worklist task.
export function isRoutineCovered(task: NurseTask): boolean {
  if (detectRoutineObs(task) === null) return false;
  if (task.conditions?.trim()) return false; // conditional -> Special Instruction
  if (hasSpecialTiming(task.when)) return false; // event-timed -> Special Instruction
  return true;
}
