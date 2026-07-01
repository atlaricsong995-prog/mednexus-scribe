"use client";

import { useEffect, useMemo, useState } from "react";
import { ShieldAlert, BellRing, Check } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { buildPatientMap, type PatientLite } from "@/lib/tasks";
import type { AlertRow } from "@/lib/server/alerts-data";

interface AlertEntry {
  id: string;
  action: "break_glass_view" | "escalation";
  who: string;
  patientId?: string;
  text: string;
  at: string;
}

function timeLabel(d: string): string {
  return new Date(d).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function toEntry(row: AlertRow): AlertEntry {
  const meta = (row.metadata ?? {}) as Record<string, unknown>;
  const who = (meta.role as string) ?? row.actor_role ?? "a clinician";
  const patientId =
    (meta.patient_id as string | undefined) ?? row.entity_id ?? undefined;
  const text =
    row.action === "break_glass_view"
      ? ((meta.reason as string) ?? "Emergency record access")
      : ((meta.message as string) ?? "Requesting attending review.");
  return {
    id: row.id,
    action: row.action === "escalation" ? "escalation" : "break_glass_view",
    who,
    patientId,
    text,
    at: timeLabel(row.created_at),
  };
}

// Doctor alert inbox (Enh Day 4, plan points 4.3 + 4.4). Backfills recent
// break-glass + escalation audit rows and subscribes to new ones in realtime,
// toasting on arrival. Supersedes the old toast-only BreakGlassListener so the
// attending has a persistent inbox, not just an ephemeral pop-up.
export function DoctorAlerts({
  patients,
  initialAlerts,
}: {
  patients: PatientLite[];
  initialAlerts: AlertRow[];
}) {
  const { toast } = useToast();
  const patientMap = useMemo(() => buildPatientMap(patients), [patients]);
  const [entries, setEntries] = useState<AlertEntry[]>(() =>
    initialAlerts.map(toEntry),
  );
  // Ids currently being acknowledged — disables the button + avoids a double POST.
  const [acking, setAcking] = useState<Set<string>>(() => new Set());

  // Acknowledge an alert: append the ack server-side, then drop it locally. The
  // realtime handler below clears it from every other open doctor/MO tab too.
  async function acknowledge(id: string) {
    setAcking((prev) => new Set(prev).add(id));
    try {
      const res = await fetch(`/api/alerts/${id}/ack`, { method: "POST" });
      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "" }));
        toast({
          variant: "destructive",
          title: "Could not acknowledge",
          description: error || "Please try again.",
        });
        return;
      }
      setEntries((prev) => prev.filter((e) => e.id !== id));
    } finally {
      setAcking((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("audit:doctor-alerts")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "audit_log" },
        (payload) => {
          const row = payload.new as AlertRow;
          // An acknowledgement elsewhere — remove the referenced alert from this tab.
          if (row.action === "alert_ack") {
            const ackedId = row.entity_id;
            if (ackedId) {
              setEntries((prev) => prev.filter((e) => e.id !== ackedId));
            }
            return;
          }
          if (
            row.action !== "break_glass_view" &&
            row.action !== "escalation"
          )
            return;
          const entry = toEntry(row);
          setEntries((prev) =>
            prev.some((e) => e.id === entry.id)
              ? prev
              : [entry, ...prev].slice(0, 30),
          );
          const p = entry.patientId
            ? patientMap.get(entry.patientId)
            : undefined;
          const where = p ? `Bed ${p.bed_number} · ${p.full_name}` : "a patient";
          toast({
            variant: "destructive",
            title:
              entry.action === "break_glass_view"
                ? "🔓 Break-glass record access"
                : "🔔 Escalation to attending",
            description: `${entry.who} — ${where}${
              entry.text ? ` — “${entry.text}”` : ""
            }`,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientMap, toast]);

  if (entries.length === 0) return null;

  return (
    <section className="mb-6 rounded-xl border border-red-200 bg-red-50/60 p-4">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-red-800">
        <ShieldAlert className="h-4 w-4" />
        {entries.length} alert{entries.length === 1 ? "" : "s"} — break-glass &
        escalations
      </h2>
      <ul className="space-y-1.5">
        {entries.map((e) => {
          const p = e.patientId ? patientMap.get(e.patientId) : undefined;
          return (
            <li
              key={e.id}
              className="flex items-start gap-2 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs"
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
                  e.action === "break_glass_view"
                    ? "bg-amber-100 text-amber-700"
                    : "bg-red-100 text-red-700",
                )}
              >
                {e.action === "break_glass_view" ? (
                  <ShieldAlert className="h-3 w-3" />
                ) : (
                  <BellRing className="h-3 w-3" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-slate-800">
                  <span className="font-medium capitalize">{e.who}</span>
                  {" · "}
                  {e.action === "break_glass_view"
                    ? "opened a masked record"
                    : "escalated"}
                  {p ? ` — Bed ${p.bed_number} · ${p.full_name}` : ""}
                </p>
                <p className="text-slate-500">
                  {e.at} — “{e.text}”
                </p>
              </div>
              <button
                type="button"
                onClick={() => acknowledge(e.id)}
                disabled={acking.has(e.id)}
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50"
              >
                <Check className="h-3 w-3" />
                {acking.has(e.id) ? "…" : "Acknowledge"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
