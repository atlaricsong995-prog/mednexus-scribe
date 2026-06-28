"use client";

import { useEffect, useMemo } from "react";

import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { buildPatientMap, type PatientLite } from "@/lib/tasks";

// Break-glass listener (Enh Day 2 Chunk B). Mounted on the attending's /doctor
// screen. Subscribes to audit_log INSERTs for action = 'break_glass_view' and
// raises a toast so the doctor is notified the moment a nurse/MO opens a masked
// record under emergency access. Read-only; subscribes with the anon client and
// relies on the demo SELECT policy from migration 005 (Realtime honours RLS).
export function BreakGlassListener({ patients }: { patients: PatientLite[] }) {
  const { toast } = useToast();
  const patientMap = useMemo(() => buildPatientMap(patients), [patients]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("audit:breakglass")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_log",
          filter: "action=eq.break_glass_view",
        },
        (payload) => {
          const row = payload.new as {
            actor_role?: string | null;
            entity_id?: string | null;
            metadata?: Record<string, unknown> | null;
          };
          const meta = row.metadata ?? {};
          const patientId =
            (meta.patient_id as string | undefined) ??
            row.entity_id ??
            undefined;
          const p = patientId ? patientMap.get(patientId) : undefined;
          const who =
            (meta.role as string | undefined) ?? row.actor_role ?? "a clinician";
          const reason = (meta.reason as string | undefined) ?? "";

          toast({
            variant: "destructive",
            title: "🔓 Break-glass record access",
            description: `${who} opened ${
              p ? `Bed ${p.bed_number} · ${p.full_name}` : "a patient record"
            }${reason ? ` — “${reason}”` : ""}`,
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientMap, toast]);

  return null;
}
