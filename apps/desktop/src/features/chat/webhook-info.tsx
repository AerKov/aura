import { Plug, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, call } from "@/lib/api";
import { reportError } from "./actions";

/** How to send alerts to Aura from monitoring tools. */
export function WebhookInfo() {
  const [open, setOpen] = useState(false);
  const [info, setInfo] = useState<{ url: string; example: string } | null>(null);

  useEffect(() => {
    if (open && !info)
      void call(() => api.hooks.info.get())
        .then(setInfo)
        .catch(reportError);
  }, [open, info]);

  return (
    <div className="relative ml-auto">
      <Button variant="ghost" size="sm" onClick={() => setOpen(!open)}>
        <Plug /> Connect
      </Button>
      {open && (
        <div className="bg-popover absolute right-0 z-20 mt-1 w-[28rem] rounded-xl border p-4 text-sm shadow-lg">
          <div className="mb-2 flex items-center justify-between font-semibold">
            Send alerts to Aura
            <Button variant="ghost" size="icon" aria-label="Close" onClick={() => setOpen(false)}>
              <X />
            </Button>
          </div>
          <p className="text-muted-foreground mb-2">
            POST JSON to this URL (generic <code>title/message/severity</code> or Alertmanager
            format). Keep the token secret. For services outside this computer, expose the server
            through a tunnel and set <code>AURA_PUBLIC_URL</code>.
          </p>
          {info ? (
            <>
              <code className="bg-muted block rounded p-2 text-xs break-all">{info.url}</code>
              <p className="text-muted-foreground mt-3 mb-1 text-xs">Try it:</p>
              <code className="bg-muted block rounded p-2 text-xs break-all">{info.example}</code>
            </>
          ) : (
            <p className="text-muted-foreground">Loading…</p>
          )}
        </div>
      )}
    </div>
  );
}
