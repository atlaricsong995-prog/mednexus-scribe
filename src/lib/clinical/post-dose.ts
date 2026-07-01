// Post-dose monitoring rules (問題 2 — Level 2, event-timed follow-up).
//
// Some drugs carry a mandatory observation a fixed interval AFTER they are given —
// classically a capillary blood-glucose check ~1h after insulin or a sulfonylurea,
// because the hypoglycaemia risk peaks post-administration, not at prescribing time.
//
// This is deliberately NOT modelled as a nurse_task at dispatch: the follow-up must
// hang off the ACTUAL give-time (when the nurse signs the MAR cell), so its due time
// reflects reality. The complete-task handler consults these rules when a medication
// cell is charted and schedules the follow-up at give-time + delay.
//
// Deterministic + auditable (same spirit as the D-008 safety checker) — a small
// controlled drug list, not an LLM guess.
import type { ObsType } from "@/lib/clinical/vocab";

export interface PostDoseMonitor {
  obs_type: ObsType;
  delayMinutes: number;
  // Human label for the generated follow-up task ("… — 1h post-dose").
  label: string;
  // Why this follow-up exists — surfaced to the nurse so it isn't a silent task.
  reason: string;
}

// Drug-name fragments (lowercased) that trigger a post-dose glucose check. Covers
// insulins (rapid, short, intermediate, long, premixed) and the insulin
// secretagogues (sulfonylureas + glinides) — the agents that can drive a patient
// hypoglycaemic within an hour of a dose. Metformin is intentionally excluded: it
// does not cause acute post-dose hypoglycaemia, so a 1h glucose check isn't standard.
const GLUCOSE_MONITOR_DRUGS = [
  "insulin",
  "actrapid",
  "novorapid",
  "novomix",
  "humulin",
  "humalog",
  "mixtard",
  "lantus",
  "levemir",
  "glargine",
  "aspart",
  "lispro",
  "gliclazide",
  "glibenclamide",
  "glimepiride",
  "glipizide",
  "tolbutamide",
  "repaglinide",
  "nateglinide",
];

const GLUCOSE_MONITOR: PostDoseMonitor = {
  obs_type: "glucose",
  delayMinutes: 60,
  label: "Check capillary blood glucose — 1h post-dose",
  reason:
    "Glucose-lowering agent given — capillary blood glucose due 1h post-dose to catch hypoglycaemia.",
};

// Does an administered medication require a timed post-dose observation? Matches on
// the free-text MAR description (e.g. "Insulin Actrapid 10 units SC BD") and the
// normalised med_key ("med:insulinactrapid"), so either surface catches it.
export function getPostDoseMonitor(
  description: string | null,
  medKey: string | null,
): PostDoseMonitor | null {
  const haystack = `${description ?? ""} ${medKey ?? ""}`.toLowerCase();
  if (GLUCOSE_MONITOR_DRUGS.some((d) => haystack.includes(d))) {
    return GLUCOSE_MONITOR;
  }
  return null;
}
