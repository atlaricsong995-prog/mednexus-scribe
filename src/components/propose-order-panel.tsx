"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Send, ClipboardPen } from "lucide-react";

import { PulseLoader } from "@/components/pulse-loader";
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
import { ROUTE_OPTIONS, FREQ_OPTIONS, DOSE_UNITS } from "@/lib/clinical/vocab";

const TASK_TYPES = [
  { value: "medication", label: "Medication" },
  { value: "observation", label: "Observation" },
  { value: "procedure", label: "Procedure" },
  { value: "other", label: "Other" },
];
const PRIORITIES = ["low", "normal", "high", "critical"];

const selectCls =
  "h-9 rounded-md border border-input bg-white px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
      {children}
    </p>
  );
}

// Propose-order panel (Enh Day 4) — resident-only. Submits a proposed order to the
// attending's approval queue. The resident cannot issue orders directly; on
// approval it becomes a formal task. For a medication order the inputs are the same
// structured, controlled fields the attending prescribes with (drug / dose+unit /
// route / frequency) — not free text (問題 2a). Observation / procedure / other are
// for NON-urgent orders that still need sign-off; true emergencies use Escalate.
export function ProposeOrderPanel({ patientId }: { patientId: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const [taskType, setTaskType] = useState("medication");
  const [priority, setPriority] = useState("normal");
  const [sending, setSending] = useState(false);

  // Free-text description (observation / procedure / other).
  const [description, setDescription] = useState("");
  // Optional clinical rationale shown to the attending on the approval card.
  const [rationale, setRationale] = useState("");
  // Structured medication fields (medication type).
  const [drug, setDrug] = useState("");
  const [doseValue, setDoseValue] = useState("");
  const [doseUnit, setDoseUnit] = useState<string>("mg");
  const [route, setRoute] = useState("");
  const [frequency, setFrequency] = useState("");
  const [duration, setDuration] = useState("");

  const isMed = taskType === "medication";

  // Compose the order line the attending sees + that becomes the task description.
  const composed = useMemo(() => {
    if (!isMed) return description.trim();
    const dose = doseValue.trim() ? `${doseValue.trim()} ${doseUnit}` : "";
    let s = [drug.trim(), dose, route, frequency].filter(Boolean).join(" ");
    const dur = duration.trim();
    if (dur) s += ` × ${dur}`;
    return s.trim();
  }, [isMed, description, drug, doseValue, doseUnit, route, frequency, duration]);

  const canSubmit = isMed ? !!drug.trim() : !!description.trim();

  function reset() {
    setDescription("");
    setRationale("");
    setDrug("");
    setDoseValue("");
    setDoseUnit("mg");
    setRoute("");
    setFrequency("");
    setDuration("");
  }

  async function submit() {
    setSending(true);
    try {
      const res = await proposeOrder({
        patientId,
        description: composed,
        taskType,
        priority,
        rationale,
        // Structured drug name (medication type only) — the server derives the
        // MAR med_key from it so safety nets (post-dose monitoring, duplicate
        // checks) recognise the drug once the order is authorised.
        drug: isMed ? drug.trim() : undefined,
      });
      if (!res.ok) throw new Error(res.error ?? "Could not propose order.");
      toast({
        title: "Order proposed",
        description: "Sent to the attending for approval.",
      });
      reset();
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
          attending approves it before it becomes a formal order. For a genuine
          emergency that can&apos;t wait, use{" "}
          <span className="font-medium">Escalate to attending</span> instead.
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <div>
            <FieldLabel>Type</FieldLabel>
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
          </div>
          <div>
            <FieldLabel>Priority</FieldLabel>
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
          </div>
        </div>

        {isMed ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-7">
            <div className="col-span-2 sm:col-span-2">
              <FieldLabel>Drug</FieldLabel>
              <Input
                value={drug}
                onChange={(e) => setDrug(e.target.value)}
                placeholder="e.g. Paracetamol"
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel>Dose</FieldLabel>
              <div className="flex gap-1">
                <Input
                  value={doseValue}
                  inputMode="decimal"
                  placeholder="1"
                  className="min-w-0 flex-1"
                  onChange={(e) => setDoseValue(e.target.value)}
                />
                <select
                  value={doseUnit}
                  onChange={(e) => setDoseUnit(e.target.value)}
                  className="h-9 shrink-0 rounded-md border border-input bg-white px-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  aria-label="Dose unit"
                >
                  {DOSE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <FieldLabel>Route</FieldLabel>
              <select
                value={route}
                onChange={(e) => setRoute(e.target.value)}
                className={`${selectCls} w-full`}
                aria-label="Route"
              >
                <option value="">—</option>
                {ROUTE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Freq</FieldLabel>
              <select
                value={frequency}
                onChange={(e) => setFrequency(e.target.value)}
                className={`${selectCls} w-full`}
                aria-label="Frequency"
              >
                <option value="">—</option>
                {FREQ_OPTIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Duration</FieldLabel>
              <Input
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                placeholder="e.g. 5 days"
              />
            </div>
          </div>
        ) : (
          <div>
            <FieldLabel>Order</FieldLabel>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={
                taskType === "observation"
                  ? "e.g. Check capillary blood glucose Q1H"
                  : taskType === "procedure"
                    ? "e.g. Insert urinary catheter"
                    : "Describe the proposed order"
              }
            />
          </div>
        )}

        <div>
          <FieldLabel>Reason / clinical rationale (optional)</FieldLabel>
          <Input
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            placeholder="e.g. BP trending up despite current regime"
          />
        </div>

        {isMed && composed && (
          <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Will propose: <span className="font-medium">{composed}</span>
          </p>
        )}

        <div className="flex justify-end">
          <Button
            size="sm"
            onClick={submit}
            disabled={sending || !canSubmit}
          >
            {sending ? (
              <PulseLoader className="text-current" />
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
