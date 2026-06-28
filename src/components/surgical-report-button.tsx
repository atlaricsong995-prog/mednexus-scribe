"use client";

import { useState } from "react";
import { FileSearch, FileText } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Surgical report stub (Enh Day 2, user decision: no image/file storage). The
// "full report" is a click-to-open modal with sample content only — it never
// touches Storage or uploads. Demonstrates the surface without the plumbing.
export function SurgicalReportButton({
  patientNote,
}: {
  patientNote?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="mt-1 text-slate-600">
          <FileSearch className="h-4 w-4" />
          View full surgical report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-slate-500" />
            Operative report
          </DialogTitle>
          <DialogDescription>
            Sample document · demo stub (no file storage)
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-3 overflow-y-auto text-sm text-slate-700">
          <div className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This is placeholder content to demonstrate the document surface. In
            production this opens the scanned operative note / PACS link.
          </div>
          <p>
            <span className="font-semibold">Procedure:</span> Laparoscopic
            cholecystectomy
          </p>
          <p>
            <span className="font-semibold">Surgeon:</span> Dr. A. Rahman ·{" "}
            <span className="font-semibold">Anaesthetist:</span> Dr. P. Lee
          </p>
          <p>
            <span className="font-semibold">Findings:</span> Inflamed gallbladder
            with multiple calculi; no CBD dilatation. Calot&apos;s triangle
            dissected; critical view of safety achieved.
          </p>
          <p>
            <span className="font-semibold">Procedure details:</span> 4-port
            technique. Cystic artery and duct clipped and divided. Gallbladder
            dissected from the liver bed; haemostasis secured. Specimen retrieved.
          </p>
          <p>
            <span className="font-semibold">Estimated blood loss:</span> 20 mL ·{" "}
            <span className="font-semibold">Complications:</span> Nil
          </p>
          {patientNote && (
            <p>
              <span className="font-semibold">Post-op assessment:</span>{" "}
              {patientNote}
            </p>
          )}
          <p>
            <span className="font-semibold">Plan:</span> Routine post-op care;
            remove dressing day 2; discharge when tolerating diet.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
