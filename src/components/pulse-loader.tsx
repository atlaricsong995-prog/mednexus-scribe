import { cn } from "@/lib/utils";

// Branded loading mark: three teal bars beating like an EKG/heartbeat trace.
// Drop-in replacement for <Loader2 className="h-4 w-4 animate-spin" />.
export function PulseLoader({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-flex h-4 w-4 items-end justify-center gap-[2px]", className)}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-current animate-heartbeat"
          style={{ height: "100%", animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </span>
  );
}
