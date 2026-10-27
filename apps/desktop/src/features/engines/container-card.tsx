import { Box, Check, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

type Info = Awaited<ReturnType<typeof loadInfo>>;
type Settings = Info["settings"];
const loadInfo = () => call(() => api.containers.get());

const inputClass =
  "bg-background focus:border-primary/60 focus:ring-primary/15 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-4";

/**
 * Sandbox level 2 (ADR 0018): each project's shell commands in its own container. Whether a project
 * uses it is set per project, in the project chat; here are the defaults.
 */
export function ContainerCard() {
  const [info, setInfo] = useState<Info | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadInfo()
      .then((i) => {
        setInfo(i);
        setDraft(i.settings);
      })
      .catch(reportError);
  }, []);

  if (!info || !draft) return null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(info.settings);
  const runtime = info.runtime;

  const save = async () => {
    setError(null);
    try {
      const next = await call(() => api.sandbox.put({ container: draft }));
      setInfo({ ...info, settings: next.container });
      setDraft(next.container);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    }
  };

  return (
    <section className="mb-8">
      <h2 className="kicker">Project containers</h2>
      <p className="text-muted-foreground mt-1 mb-4 text-sm">
        The strongest isolation: a project's shell commands run in its own Linux container that sees
        only the project folder. Turn it on per project in the project chat.
      </p>
      <div className="bg-card rounded-2xl border p-5">
        <p className="mb-4 flex items-start gap-2 text-[13px]">
          {runtime.ok ? (
            <Box className="mt-0.5 size-4 shrink-0 text-emerald-500" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />
          )}
          <span>
            {runtime.ok
              ? `${runtime.engine === "docker" ? "Docker" : "Podman"} ${runtime.version} is ready.`
              : runtime.reason}
          </span>
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className="kicker mb-1 block">Image</span>
            <input
              className={cn(inputClass, "w-full font-mono text-[13px]")}
              value={draft.image}
              onChange={(e) => setDraft({ ...draft, image: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="kicker mb-1 block">Memory, MB</span>
            <input
              type="number"
              min={256}
              max={65536}
              step={256}
              className={cn(inputClass, "w-full")}
              value={draft.memoryMb}
              onChange={(e) => setDraft({ ...draft, memoryMb: Number(e.target.value) })}
            />
          </label>
          <label className="block">
            <span className="kicker mb-1 block">CPUs</span>
            <input
              type="number"
              min={0.5}
              max={64}
              step={0.5}
              className={cn(inputClass, "w-full")}
              value={draft.cpus}
              onChange={(e) => setDraft({ ...draft, cpus: Number(e.target.value) })}
            />
          </label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Toggle
            on={draft.network}
            label="Network"
            text={
              draft.network
                ? "Commands can download packages."
                : "No network: nothing gets in or out."
            }
            onChange={(network) => setDraft({ ...draft, network })}
          />
          <Toggle
            on={draft.newProjects}
            label="New projects"
            text={
              draft.newProjects
                ? "New projects start in a container."
                : "New projects use the host."
            }
            onChange={(newProjects) => setDraft({ ...draft, newProjects })}
          />
        </div>
        {error && <p className="text-destructive mt-2 text-xs">{error}</p>}
        <div className="mt-3 flex items-center gap-3">
          <Button size="sm" className="rounded-full" disabled={!dirty} onClick={() => void save()}>
            <Check /> {saved ? "Saved" : "Save"}
          </Button>
          <span className="text-muted-foreground text-xs">
            Running containers are recreated with the new settings on their next command; project
            files stay.
          </span>
        </div>
      </div>
    </section>
  );
}

function Toggle({
  on,
  label,
  text,
  onChange,
}: {
  on: boolean;
  label: string;
  text: string;
  onChange: (on: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => onChange(!on)}
      className={cn(
        "rounded-xl border px-3 py-2 text-left transition-colors",
        on ? "border-primary bg-primary/5" : "hover:bg-accent/60",
      )}
    >
      <div className="text-sm font-medium">
        {label}: {on ? "on" : "off"}
      </div>
      <div className="text-muted-foreground text-xs">{text}</div>
    </button>
  );
}
