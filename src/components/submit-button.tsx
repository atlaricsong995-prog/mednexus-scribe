"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { PulseLoader } from "@/components/pulse-loader";

// Submit button for server-action <form action={...}> that shows the branded
// loading mark while the action is in flight. Must be rendered inside the form.
export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className={className} disabled={pending}>
      {pending ? (
        <>
          <PulseLoader className="text-current" />
          Entering…
        </>
      ) : (
        children
      )}
    </Button>
  );
}
