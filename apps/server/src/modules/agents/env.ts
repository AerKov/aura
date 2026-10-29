/**
 * Environment for agents' commands and MCP servers (ADR 0020). Config files hold names and
 * references, never secret values: `${secret:NAME}` reads Aura's secret store, `${env:NAME}` the
 * server's own environment. Plain values are allowed only for names that do not look secret.
 */

export const ENV_NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;
const REF = /^\$\{(env|secret):([A-Z_][A-Z0-9_]{0,63})\}$/;
const SECRET_LIKE = /KEY|TOKEN|SECRET|PASSW|PASS$|AUTH|CREDENTIAL|COOKIE|SESSION|PRIVATE/i;
/** Names a config may not set: they would change how commands run or where they connect. */
const RESERVED = /^(PATH|HOME|SHELL|USER|LD_\w+|DYLD_\w+|NODE_OPTIONS|BUN_\w+|AURA_\w+)$/;
const MAX_VALUE = 2000;

/** A reference to a value in Aura's secret store, as written in config files. */
export function secretRef(name: string): string {
  // Built from parts: bundlers fold an escaped `${` in a template literal into an invalid one.
  return ["$", "{secret:", name, "}"].join("");
}

export function looksSecret(name: string): boolean {
  return SECRET_LIKE.test(name);
}

/** Why `name=value` is not allowed in a config file, or null when it is. */
export function envProblem(name: string, value: unknown): string | null {
  if (!ENV_NAME.test(name)) return `${name} is not a variable name like SERVICE_URL`;
  if (RESERVED.test(name)) return `${name} cannot be set here`;
  if (typeof value !== "string") return `${name} must be text`;
  if (value.length > MAX_VALUE) return `${name} is too long`;
  if (REF.test(value)) return null;
  if (value.includes("${")) return `${name}: use \${secret:NAME} or \${env:NAME}`;
  if (looksSecret(name))
    return `${name} looks like a secret: store it under Secrets and use \${secret:${name}}`;
  return null;
}

/** Validates a whole map; throws the first problem through `fail`. */
export function validateEnvMap(
  raw: unknown,
  fail: (message: string) => Error,
): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw fail("env must be a mapping");
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const problem = envProblem(name, value);
    if (problem) throw fail(problem);
    out[name] = value as string;
  }
  if (Object.keys(out).length > 50) throw fail("at most 50 variables");
  return out;
}

export interface EnvSources {
  secret(name: string): string | null;
  env: Record<string, string | undefined>;
}

/** Resolves references; names whose reference has no value are reported, not set. */
export function resolveEnv(
  map: Record<string, string>,
  sources: EnvSources,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, raw] of Object.entries(map)) {
    const ref = REF.exec(raw);
    if (!ref) {
      values[name] = raw;
      continue;
    }
    const value = ref[1] === "secret" ? sources.secret(ref[2] ?? "") : sources.env[ref[2] ?? ""];
    if (value === undefined || value === null || value === "") missing.push(name);
    else values[name] = value;
  }
  return { values, missing };
}

/** Replaces secret values in text shown to people or models with a placeholder. */
export function redact(text: string, secrets: readonly string[]): string {
  let out = text;
  for (const value of secrets) {
    if (value.length >= 6) out = out.split(value).join("[secret]");
  }
  return out;
}

const HEADER_NAME = /^[A-Za-z0-9-]{1,64}$/;
const INNER_REF = /\$\{(env|secret):([A-Z_][A-Z0-9_]{0,63})\}/g;
/** Headers that carry credentials: their values must come from references. */
const SECRET_HEADER = /^(authorization|proxy-authorization|cookie)$|key|token|secret|auth/i;

/** Why a header of an MCP server at a URL is not allowed in a config file, or null. */
export function headerProblem(name: string, value: unknown): string | null {
  if (!HEADER_NAME.test(name)) return `${name} is not a header name like Authorization`;
  if (typeof value !== "string") return `${name} must be text`;
  if (value.length > MAX_VALUE) return `${name} is too long`;
  const withoutRefs = value.replace(INNER_REF, "");
  if (withoutRefs.includes("${")) return `${name}: use \${secret:NAME} or \${env:NAME}`;
  if (SECRET_HEADER.test(name) && withoutRefs.length === value.length)
    return `${name} carries a credential: store it under Secrets and write, for example, Bearer ${secretRef("TOKEN")}`;
  return null;
}

export function validateHeaders(
  raw: unknown,
  fail: (message: string) => Error,
): Record<string, string> {
  if (raw === undefined || raw === null) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) throw fail("headers must be a mapping");
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    const problem = headerProblem(name, value);
    if (problem) throw fail(problem);
    out[name] = value as string;
  }
  if (Object.keys(out).length > 20) throw fail("at most 20 headers");
  return out;
}

/** Fills references inside values (`Bearer ${secret:TOKEN}`); unresolved names are reported. */
export function resolveTemplates(
  map: Record<string, string>,
  sources: EnvSources,
): { values: Record<string, string>; missing: string[] } {
  const values: Record<string, string> = {};
  const missing: string[] = [];
  for (const [name, raw] of Object.entries(map)) {
    let ok = true;
    const value = raw.replace(INNER_REF, (_, kind: string, ref: string) => {
      const v = kind === "secret" ? sources.secret(ref) : sources.env[ref];
      if (v === undefined || v === null || v === "") {
        ok = false;
        return "";
      }
      return v;
    });
    if (ok) values[name] = value;
    else missing.push(name);
  }
  return { values, missing };
}
