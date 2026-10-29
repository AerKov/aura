import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputClass =
  "bg-background focus:border-primary/60 focus:ring-primary/15 rounded-xl border px-3 py-2 text-sm outline-none focus:ring-4";

const SECRET_REF = /^\$\{secret:([A-Z_][A-Z0-9_]*)\}$/;
const SECRET_LIKE = /KEY|TOKEN|SECRET|PASSW|PASS$|AUTH|CREDENTIAL|COOKIE|SESSION|PRIVATE/i;

/**
 * `${secret:NAME}`, built from parts: a template literal with an escaped `${` gets folded into an
 * invalid one by the production bundler.
 */
function secretRef(name: string): string {
  return ["$", "{secret:", name, "}"].join("");
}

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
      env[name] = secretRef(secretName);
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
  // Secrets do nothing until a variable refers to them; offer the ones not used here yet.
  const used = new Set(rows.map((r) => SECRET_REF.exec(r.value)?.[1] ?? r.name));
  const unused = secrets.filter((s) => !used.has(s));

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={row.id} className="flex flex-wrap items-center gap-2">
          <input
            className={cn(inputClass, "w-48 font-mono text-[13px]")}
            placeholder="SERVICE_URL"
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
              placeholder="https://service.example.com"
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
              "rounded-pill border p-1.5",
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
        className="rounded-pill"
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
      {unused.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-muted-foreground text-xs">Stored secrets:</span>
          {unused.map((name) => (
            <button
              key={name}
              type="button"
              title={`Give ${name} to these commands`}
              onClick={() =>
                onChange([
                  ...rows,
                  {
                    id: crypto.randomUUID(),
                    name,
                    value: secretRef(name),
                    secret: true,
                    secretValue: "",
                    set: true,
                  },
                ])
              }
              className="hover:bg-accent/60 flex items-center gap-1 rounded-pill border px-2 py-0.5 font-mono text-[11px]"
            >
              <Plus className="size-3" /> {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
