import { cn } from "@/lib/utils";

// Breathing dot for "live connection" / "recording" states.
export function LiveDot({
  label,
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full rounded-full bg-glow opacity-60 animate-breathe" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-glow" />
      </span>
      {label ? <span className="text-xs font-medium">{label}</span> : null}
    </span>
  );
}
