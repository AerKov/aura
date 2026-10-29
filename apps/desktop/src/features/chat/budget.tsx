import { budgetText, formatTokens, type Project } from "@aura/shared";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { setState } from "@/features/chat/store";
import { api, call } from "@/lib/api";
import { cn } from "@/lib/utils";
import { parseTokens } from "./tokens";

export interface Limits {
  usd: number | null;
  tokens: number | null;
}

type Unit = "none" | "tokens" | "usd";

/**
 * A limit in tokens (subscription engines), in dollars (paid APIs) or none (ADR 0023). Dollars on a
 * subscription are only an estimate at API prices, so tokens are offered first.
 */
export function BudgetEditor({
  value,
  spent,
  onSave,
}: {
  value: Limits;
  spent: { usd: number; tokens: number };
  onSave: (limits: Limits) => Promise<void>;
}) {
  const initial: Unit = value.tokens !== null ? "tokens" : value.usd !== null ? "usd" : "none";
  const [unit, setUnit] = useState<Unit>(initial);
  const [amount, setAmount] = useState(
    value.tokens !== null
      ? formatTokens(value.tokens)
      : value.usd !== null
        ? String(value.usd)
        : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setError(null);
    let limits: Limits = { usd: null, tokens: null };
    if (unit === "tokens") {
      const tokens = parseTokens(amount);
      if (tokens === null || tokens < 1000) return setError("Enter tokens, e.g. 2M or 500K");
      limits = { usd: null, tokens };
    } else if (unit === "usd") {
      const usd = Number(amount.replace(",", "."));
      if (!Number.isFinite(usd) || usd <= 0) return setError("Enter dollars, e.g. 5");
      limits = { usd, tokens: null };
    }
    setBusy(true);
    try {
      await onSave(limits);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-2 text-sm">
      <p className="text-muted-foreground text-xs">
        Used {formatTokens(spent.tokens)} tokens
        {spent.usd > 0 ? ` (≈ $${spent.usd.toFixed(2)} at API prices)` : ""}. Limit now:{" "}
        {budgetText(value)}.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["none", "No limit"],
            ["tokens", "Tokens"],
            ["usd", "Dollars"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            aria-pressed={unit === key}
            onClick={() => setUnit(key)}
            className={cn(
              "rounded-pill border px-3 py-1 text-xs",
              unit === key ? "border-primary bg-primary/10 text-foreground" : "hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {unit !== "none" && (
        <input
          aria-label={unit === "tokens" ? "Token limit" : "Dollar limit"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
          placeholder={unit === "tokens" ? "e.g. 2M" : "e.g. 5"}
          className="bg-background rounded-lg border px-3 py-1.5 font-mono text-sm"
        />
      )}
      <p className="text-muted-foreground text-xs">
        {unit === "tokens"
          ? "For subscriptions (Claude Code, Gemini CLI, Codex, OpenCode) and local models."
          : unit === "usd"
            ? "Real money only on paid APIs (OpenRouter, an OpenAI-compatible API)."
            : "Agents still stop after 8 replies to each other in a row."}
      </p>
      {error && <p className="text-destructive text-xs">{error}</p>}
      <Button
        size="sm"
        className="justify-self-start rounded-pill"
        disabled={busy}
        onClick={() => void save()}
      >
        Save
      </Button>
    </div>
  );
}

/** The project's usage as a ring (when it has a limit) and a button that opens its limit. */
export function BudgetButton({ project }: { project: Project }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const byTokens = project.budgetTokens !== null || project.budgetUsd === null;
  const spent = byTokens ? project.spentTokens : project.spentUsd;
  const limit = byTokens ? project.budgetTokens : project.budgetUsd;
  const ratio = limit ? Math.min(1, spent / limit) : 0;
  const r = 15;
  const c = 2 * Math.PI * r;
  const show = (n: number) => (byTokens ? formatTokens(n) : `$${n.toFixed(2)}`);

  return (
    <div className="relative" ref={box}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="hover:bg-accent flex items-center gap-2 rounded-xl px-1.5 py-1"
        title={`Used ${formatTokens(project.spentTokens)} tokens (≈ $${project.spentUsd.toFixed(2)} at API prices) · budget: ${budgetText({ usd: project.budgetUsd, tokens: project.budgetTokens })}. Click to change.`}
        aria-label="Project budget"
      >
        <svg viewBox="0 0 36 36" className="size-9 -rotate-90" aria-hidden>
          <circle cx="18" cy="18" r={r} fill="none" stroke="var(--muted)" strokeWidth="4" />
          {limit !== null && (
            <circle
              cx="18"
              cy="18"
              r={r}
              fill="none"
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${c * ratio} ${c}`}
              className={cn(
                ratio >= 1
                  ? "stroke-rose-500"
                  : ratio >= 0.8
                    ? "stroke-amber-500"
                    : "stroke-emerald-500",
              )}
            />
          )}
        </svg>
        <div className="text-left text-xs leading-tight whitespace-nowrap max-sm:hidden">
          <div className="font-medium">
            {show(spent)}
            {byTokens ? " tok" : ""}
          </div>
          <div className="text-muted-foreground">of {limit !== null ? show(limit) : "∞"}</div>
        </div>
      </button>
      {open && (
        <div className="bg-popover text-popover-foreground absolute top-12 right-0 z-30 w-72 rounded-xl border p-4 shadow-lg">
          <h3 className="mb-2 font-semibold">Project budget</h3>
          <BudgetEditor
            value={{ usd: project.budgetUsd, tokens: project.budgetTokens }}
            spent={{ usd: project.spentUsd, tokens: project.spentTokens }}
            onSave={async (limits) => {
              const updated = await call(() =>
                api.projects({ projectId: project.id }).budget.put(limits),
              );
              setState((s) => ({ projects: { ...s.projects, [project.id]: updated as Project } }));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
