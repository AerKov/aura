import type { Project, ProjectIsolation } from "@aura/shared";
import { Box, Monitor, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { loadProjects, reportError } from "./actions";

type Info = Awaited<ReturnType<typeof loadInfo>>;
const loadInfo = (projectId: string) => call(() => api.projects({ projectId }).container.get());

const OPTIONS: { value: ProjectIsolation; label: string; text: string; icon: typeof Box }[] = [
  {
    value: "container",
    label: "Container",
    text: "Commands run in this project's own Linux container. It sees only the project folder.",
    icon: Box,
  },
  {
    value: "host",
    label: "This computer",
    text: "Commands run on your computer, in the command sandbox when it is on.",
    icon: Monitor,
  },
];

/** Where a project's shell commands run (ADR 0018). Only the user changes it, never agents. */
export function IsolationPanel({ project, onClose }: { project: Project; onClose: () => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    loadInfo(project.id).then(setInfo).catch(reportError);
  }, [project.id]);

  useEffect(() => refresh(), [refresh]);

  const choose = async (isolation: ProjectIsolation) => {
    setBusy(true);
    try {
      await call(() => api.projects({ projectId: project.id }).isolation.put({ isolation }));
      await loadProjects();
      refresh();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await call(() => api.projects({ projectId: project.id }).container.reset.post());
      refresh();
    } catch (error) {
      reportError(error);
    } finally {
      setBusy(false);
    }
  };

  const container = info?.container ?? null;
  return (
    <aside className="bg-background flex w-80 shrink-0 flex-col border-l max-lg:absolute max-lg:inset-y-0 max-lg:right-0 max-lg:z-10 max-lg:shadow-xl">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <h2 className="font-semibold">Where commands run</h2>
        <Button variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
          <X />
        </Button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={busy}
            aria-pressed={project.isolation === o.value}
            onClick={() => void choose(o.value)}
            className={cn(
              "w-full rounded-xl border px-3 py-2 text-left transition-colors",
              project.isolation === o.value ? "border-primary bg-primary/5" : "hover:bg-accent/60",
            )}
          >
            <div className="flex items-center gap-2 text-sm font-medium">
              <o.icon className="size-4" /> {o.label}
            </div>
            <div className="text-muted-foreground text-xs">{o.text}</div>
          </button>
        ))}
        <div className="text-muted-foreground pt-2 text-xs">
          {info?.error ? (
            <p className="text-amber-600 dark:text-amber-400">{info.error}</p>
          ) : container ? (
            <p>
              Container{" "}
              <span className="text-foreground font-medium">
                {container.state === "missing"
                  ? "not created yet (it starts with the first command)"
                  : container.state}
              </span>
              {container.image ? ` · ${container.image}` : ""}
              {container.outdated ? " · recreated with new settings on the next command" : ""}
            </p>
          ) : null}
          <p className="mt-2">Set the image, memory and network on the Engines page.</p>
        </div>
      </div>
      {container && container.state !== "missing" && (
        <div className="border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            className="rounded-full"
            disabled={busy}
            onClick={() => void reset()}
          >
            <RotateCcw /> Reset container
          </Button>
          <p className="text-muted-foreground mt-1 text-xs">
            Removes it with anything installed outside the project folder. Project files stay.
          </p>
        </div>
      )}
    </aside>
  );
}
