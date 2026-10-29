import type * as React from "react";

import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input bg-input-bg placeholder:text-muted-foreground hover:border-foreground/45 focus-visible:border-ring aria-invalid:border-destructive caret-primary flex field-sizing-content min-h-16 w-full rounded-md border px-2.5 py-1.5 text-sm transition-colors outline-none focus-visible:outline-offset-0 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
