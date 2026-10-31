import type { Skill } from "@aura/shared";
import { History, RotateCcw, Sparkles } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { reportError } from "@/features/chat/actions";
import { tr } from "@/features/localization/i18n";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";

/** Skills: what each agent knows, its versions (git commits) and rollback. */
export function SkillsView() {
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const list = await call(() => api.skills.get());
    setSkills(list);
    setSelected((current) => current ?? list[0]?.name ?? null);
  }, []);

  useEffect(() => {
    void load().catch(reportError);
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    void call(() => api.skills({ name: selected }).get())
      .then((s) => setContent(s.content.replace(/^---[\s\S]*?---\n?/, "")))
      .catch(reportError);
  }, [selected]);

  const rollback = async (name: string, ref: string) => {
    setError(null);
    try {
      await call(() => api.skills({ name }).rollback.post({ ref }));
      await load();
      setSelected(null);
      setSelected(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rollback failed");
    }
  };

  const skill = skills?.find((s) => s.name === selected);

  return (
    <section className="flex min-w-0 flex-1">
      <div className="w-64 shrink-0 overflow-y-auto border-r p-2">
        <h1 className="flex items-center gap-2 px-2 pt-3 pb-3 text-xl font-semibold tracking-tight">
          <Sparkles className="text-primary size-5" /> {tr("Skills")}
        </h1>
        {skills?.length === 0 && (
          <p className="text-muted-foreground px-2 text-sm">
            {tr("No skills yet. Agents propose them; you approve.")}
          </p>
        )}
        {skills?.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => setSelected(s.name)}
            className={cn(
              "w-full rounded-lg px-2 py-2 text-left",
              s.name === selected ? "bg-accent" : "hover:bg-accent/60",
            )}
          >
            <div className="font-medium">{s.name}</div>
            <div className="text-muted-foreground truncate text-xs">{s.description}</div>
          </button>
        ))}
      </div>
      {skill && (
        <div className="min-w-0 flex-1 overflow-y-auto p-6">
          <h2 className="font-mono text-2xl font-semibold tracking-tight">{skill.name}</h2>
          <p className="text-muted-foreground mb-1">{skill.description}</p>
          <p className="text-muted-foreground mb-4 text-sm">
            {tr("Used by")}{" "}
            {skill.agents.length ? skill.agents.map((a) => `@${a}`).join(", ") : tr("no agents")}
          </p>
          <div className="mb-6 rounded-xl border p-4">
            <Markdown>{content}</Markdown>
          </div>
          <h3 className="mb-2 flex items-center gap-2 font-semibold">
            <History className="size-4" /> {tr("Versions")}
          </h3>
          {error && <p className="text-destructive mb-2 text-sm">{error}</p>}
          <ul className="divide-y rounded-xl border">
            {skill.versions.map((v, index) => (
              <li key={v.ref} className="flex items-center gap-3 px-3 py-2 text-sm">
                <code className="text-muted-foreground">{v.ref}</code>
                <span className="min-w-0 flex-1 truncate">{v.subject}</span>
                <span className="text-muted-foreground text-xs">
                  {new Date(v.date).toLocaleString()}
                </span>
                {index === 0 ? (
                  <span className="text-xs font-medium text-success">{tr("current")}</span>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void rollback(skill.name, v.ref)}
                  >
                    <RotateCcw /> {tr("Restore")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
