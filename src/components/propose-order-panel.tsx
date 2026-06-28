"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Send, ClipboardPen } from "lucide-react";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { proposeOrder } from "@/app/mo/actions";
import { useToast } from "@/hooks/use-toast";

const TASK_TYPES = [
  { value: "medication", label: "Medication" },
  { value: "observation", label: "Observation" },
  { value: "procedure", label: "Procedure" },
  { value: "other", label: "Other" },
];
const PRIORITIES = ["low", "normal", "high", "critical"];

const selectCls =
  "h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

// Propose-order panel (Enh Day 4) — resident-only. Submits a proposed order to the
// attending's approval queue. The resident cannot issue orders directly; on
// approval it becomes a formal task.
export function ProposeOrderPanel({ patientId }: { patientId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState("medication");
  const [priority, setPriority] = useState("normal");
  const [sending, setSending] = useState(false);

  async function submit() {
    setSending(true);
    try {
      const res = await proposeOrder({
        patientId,
        description,
        taskType,
        priority,
      });
      if (!res.ok) throw new Error(res.error ?? "Could not propose order.");
      toast({
        title: "Order proposed",
        description: "Sent to the attending for approval.",
      });
      setDescription("");
      router.refresh();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Propose failed",
        description: err instanceof Error ? err.message : "Unknown error.",
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="border-sky-200">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardPen className="h-4 w-4 text-sky-600" /> Propose an order
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-slate-500">
          As a resident you can&apos;t issue orders directly. Propose one — the
          attending approves it before it becomes a formal order.
        </p>
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. IV paracetamol 1 g QDS PRN for fever"
        />
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={selectCls}
            value={taskType}
            onChange={(e) => setTaskType(e.target.value)}
            aria-label="Order type"
          >
            {TASK_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className={selectCls}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            aria-label="Priority"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p} className="capitalize">
                {p}
              </option>
            ))}
          </select>
          <Button
            size="sm"
            onClick={submit}
            disabled={sending || !description.trim()}
            className="ml-auto"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Propose
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
