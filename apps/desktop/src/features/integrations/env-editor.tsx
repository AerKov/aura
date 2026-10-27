import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputClass =
  "bg-background focus:border-primary/60 focus:ring-primary/15 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-4";

const SECRET_REF = /^\$\{secret:([A-Z_][A-Z0-9_]*)\}$/;
const SECRET_LIKE = /KEY|TOKEN|SECRET|PASSW|PASS$|AUTH|CREDENTIAL|COOKIE|SESSION|PRIVATE/i;

export interface EnvRow {
  /** Stable key for the list while names are edited. */
  id: string;
  name: string;
  /** Plain value, or the stored reference for a secret row. */
  value: string;
  secret: boolean;
  /** A new value for the secret, saved to Secrets; empty keeps the stored one. */
  secretValue: string;
  /** Whether the variable has a value now (from the server). */
  set: boolean;
}

export function rowsFromEnv(entries: { name: string; value: string; set: boolean }[]): EnvRow[] {
  return entries.map((e) => ({
    id: crypto.randomUUID(),
    name: e.name,
    value: e.value,
    secret: SECRET_REF.test(e.value),
    secretValue: "",
    set: e.set,
  }));
}

/**
 * The config map (secret rows become `${secret:NAME}`) and the secret values to store first. A new
 * secret is stored under the variable's own name.
 */
export function envFromRows(rows: EnvRow[]): {
  env: Record<string, string>;
  secrets: Record<string, string>;
} {
  const env: Record<string, string> = {};
  const secrets: Record<string, string> = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    if (row.secret) {
      const existing = SECRET_REF.exec(row.value)?.[1];
      const secretName = row.secretValue ? name : (existing ?? name);
      if (row.secretValue) secrets[secretName] = row.secretValue;
      env[name] = `$${"{"}secret:${secretName}}`;
    } else {
      env[name] = row.value;
    }
  }
  return { env, secrets };
}

/** Variables for a server or an agent: plain values, or secrets kept out of files. */
export function EnvEditor({
  rows,
  secrets,
  onChange,
}: {
  rows: EnvRow[];
  secrets: string[];
  onChange: (rows: EnvRow[]) => void;
}) {
  const update = (i: number, patch: Partial<EnvRow>) =>
    onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.id} className="flex flex-wrap items-center gap-2">
          <input
            className={cn(inputClass, "w-48 font-mono text-[13px]")}
            placeholder="REDMINE_URL"
            value={row.name}
            onChange={(e) => {
              const name = e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_");
              update(i, { name, secret: row.secret || SECRET_LIKE.test(name) });
            }}
          />
          {row.secret ? (
            <input
              type="password"
              autoComplete="off"
              className={cn(inputClass, "min-w-40 flex-1")}
              placeholder={
                SECRET_REF.test(row.value)
                  ? row.set
                    ? "stored (type to replace)"
                    : `no value yet${secrets.length ? "" : ": type it here"}`
                  : "secret value"
              }
              value={row.secretValue}
              onChange={(e) => update(i, { secretValue: e.target.value })}
            />
          ) : (
            <input
              className={cn(inputClass, "min-w-40 flex-1 font-mono text-[13px]")}
              placeholder="https://redmine.example.com"
              value={row.value}
              onChange={(e) => update(i, { value: e.target.value })}
            />
          )}
          <button
            type="button"
            title={row.secret ? "Secret: kept out of files and hidden" : "Plain value"}
            aria-pressed={row.secret}
            onClick={() => update(i, { secret: !row.secret })}
            className={cn(
              "rounded-full border p-1.5",
              row.secret ? "border-primary bg-primary/10 text-primary" : "text-muted-foreground",
            )}
          >
            <KeyRound className="size-4" />
          </button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Remove ${row.name || "variable"}`}
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        className="rounded-full"
        onClick={() =>
          onChange([
            ...rows,
            {
              id: crypto.randomUUID(),
              name: "",
              value: "",
              secret: false,
              secretValue: "",
              set: false,
            },
          ])
        }
      >
        <Plus /> Add variable
      </Button>
    </div>
  );
}
