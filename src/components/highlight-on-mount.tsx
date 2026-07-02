"use client";

import { cn } from "@/lib/utils";

// Flash a teal highlight once when this wrapper first mounts, then fade to
// transparent. Purely visual — draws the eye to a newly-arrived realtime item.
export function HighlightOnMount({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("animate-highlight-in rounded-md", className)}>{children}</div>;
}
