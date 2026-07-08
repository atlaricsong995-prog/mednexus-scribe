// Already-on-chart duplicate check for MO-proposed medications (2E, 2026-07-08).
// The dictation direction already has this net (extract review recomputes safety
// flags against the current record AND active resident orders — dispatch/route.ts);
// this is the mirror: a resident proposing a drug the chart already carries must
// be flagged BEFORE the attending authorises a double order. Advisory, not a
// block — continuing a drug via proposal is legitimate; the attending decides.
// Runtime imports are relative-with-extension (not @/ alias) so the live verify
// script can load this module under node --experimental-strip-types, same as
// clinical/obs-routing.ts.
import { createAdminClient } from "../supabase/admin.ts";
import { medKey } from "../clinical/vocab.ts";
import type { Medication } from "@/lib/supabase/types";

export async function findActiveDuplicate(
  patientId: string,
  drug: string,
): Promise<string | null> {
  const key = medKey(drug);
  const supabase = createAdminClient();

  const [{ data: note }, { data: moTasks }] = await Promise.all([
    // The active medication list IS the latest confirmed note (append-only model).
    supabase
      .from("clinical_notes")
      .select("medications")
      .eq("patient_id", patientId)
      .eq("status", "confirmed")
      .order("confirmed_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // A still-open resident order for the same drug (proposed or authorised) —
    // not on the chart yet, so the note check above can't see it.
    supabase
      .from("tasks")
      .select("description, status")
      .eq("patient_id", patientId)
      .eq("proposed_by_mo", true)
      .eq("med_key", key)
      .in("status", ["submitted", "pending", "in_progress"]),
  ]);

  const meds = ((note?.medications as Medication[] | null) ?? []).filter(
    (m) => m?.drug?.trim(),
  );
  const existing = meds.find((m) => medKey(m.drug) === key);
  if (existing) {
    const summary = [existing.drug, existing.dose, existing.route, existing.frequency]
      .filter(Boolean)
      .join(" ");
    return `${existing.drug} is already on the current chart (${summary}) — possible duplicate order.`;
  }

  const openOrder = (moTasks ?? [])[0];
  if (openOrder) {
    return `Already an active resident order for this drug (${openOrder.description})${
      openOrder.status === "submitted" ? " awaiting authorisation" : ""
    } — possible duplicate.`;
  }

  return null;
}
