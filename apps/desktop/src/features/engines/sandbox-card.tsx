import { Check, ShieldCheck, ShieldOff } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

type Status = Awaited<ReturnType<typeof loadStatus>>;
type Mode = Status["mode"];
const loadStatus = () => call(() => api.sandbox.get());

const MODES: { value: Mode; label: string; text: string }[] = [
  { value: "auto", label: "Auto", text: "Sandbox when this computer supports it." },
  { value: "required", label: "Required", text: "Never run a command outside the sandbox." },
  { value: "off", label: "Off", text: "Checks in the app only." },
];

/**
 * The OS sandbox for agents' shell commands (ADR 0015): writes only in the project folder, no
 * credentials, no network (ADR 0030).
 */
export function SandboxCard() {
  const [status, setStatus] = useState<Status | null>(null);
  const [mode, setMode] = useState<Mode>("auto");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadStatus()
      .then((s) => {
        setStatus(s);
        setMode(s.mode);
      })
      .catch(reportError);
  }, []);

  if (!status) return null;
  const dirty = mode !== status.mode;

  const save = async () => {
    setError(null);
    try {
      const next = await call(() => api.sandbox.put({ mode }));
      setStatus(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  const Icon = status.active ? ShieldCheck : ShieldOff;
  return (
    <section className="mb-8">
      <h2 className="kicker">Command sandbox</h2>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">
        Shell commands from Claude Code and Aura's own agent run in an OS sandbox: they write only
        in the project folder, cannot read credentials, and have no network.
      </p>
      <div className="bg-card rounded-2xl border p-5">
        <p className="mb-4 flex items-start gap-2 text-[13px]">
          <Icon
            className={cn(
              "mt-0.5 size-4 shrink-0",
              status.active ? "text-emerald-500" : "text-amber-500",
            )}
          />
          <span>
            {status.active
              ? "Active: agents' shell commands are sandboxed."
              : status.mode === "off"
                ? "Off: shell commands run with your user's permissions."
                : status.mode === "required"
                  ? `Required but not available, so shell commands are refused. ${status.reason ?? ""}`
                  : `Not available on this computer, so shell commands run unsandboxed. ${status.reason ?? ""}`}
          </span>
        </p>
        <div className="mb-4 grid gap-2 sm:grid-cols-3">
          {MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              className={cn(
                "rounded-xl border px-3 py-2 text-left transition-colors",
                mode === m.value ? "border-primary bg-primary/5" : "hover:bg-accent/60",
              )}
            >
              <div className="text-sm font-medium">{m.label}</div>
              <div className="text-muted-foreground text-xs">{m.text}</div>
            </button>
          ))}
        </div>
        {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" className="rounded-pill" disabled={!dirty} onClick={() => void save()}>
            <Check /> {saved ? "Saved" : "Save"}
          </Button>
          <span className="text-muted-foreground text-xs">
            Gemini CLI, Codex and OpenCode use their own sandboxes; Aura still decides their
            permission requests.
          </span>
        </div>
      </div>
    </section>
  );
}
