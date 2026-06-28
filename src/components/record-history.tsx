"use client";

import { useState } from "react";
import { History, ChevronDown, ChevronRight } from "lucide-react";

import { MedicalRecordBody } from "@/components/medical-record-body";
import { cn } from "@/lib/utils";
import type { ClinicalNote } from "@/lib/supabase/types";

function stamp(note: ClinicalNote): string {
  const d = note.confirmed_at ?? note.created_at;
  return new Date(d).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Append-only record history (Enh Day 3, plan point 5). Read-only, collapsed by
// default — each entry expands to the full archived note. Rendered under the
// current record inside MedicalRecordBody (client child so the server component
// stays serialisable).
export function RecordHistory({ notes }: { notes: ClinicalNote[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (notes.length === 0) return null;

  return (
    <div className="border-t border-slate-100 pt-3">
      <p className="mb-2 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        <History className="h-3.5 w-3.5" /> History ({notes.length})
      </p>
      <ul className="space-y-1.5">
        {notes.map((n) => {
          const expanded = openId === n.id;
          return (
            <li
              key={n.id}
              className="overflow-hidden rounded-lg border border-slate-100"
            >
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : n.id)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs transition-colors",
                  expanded ? "bg-slate-50" : "hover:bg-slate-50",
                )}
              >
                <span className="flex items-center gap-1.5 text-slate-600">
                  {expanded ? (
                    <ChevronDown className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" />
                  )}
                  <span className="font-medium">Archived version</span>
                  <span className="text-slate-400">· {stamp(n)}</span>
                </span>
                <span className="shrink-0 text-slate-400">
                  {n.medications.length} med
                  {n.medications.length === 1 ? "" : "s"}
                </span>
              </button>
              {expanded && (
                <div className="border-t border-slate-100 bg-white px-3 py-3">
                  <MedicalRecordBody note={n} variant="archived" />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
