/**
 * What an app declares about its data and actions (ADR 0024, phases 24-25): collections with an
 * optional schema, actions over them (exposed to agents like MCP tools), which actions other apps
 * may call, and which actions of other apps it wants to call. Pure validation, used for manifests.
 */

export class ContractError extends Error {
  override name = "ContractError";
}

export const FIELD_TYPES = ["string", "number", "boolean", "date", "json"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface Field {
  type: FieldType;
  optional: boolean;
}

export interface Collection {
  /** Empty: records can hold any fields. */
  fields: Record<string, Field>;
}

export const ACTION_KINDS = ["list", "get", "count", "insert", "update", "delete"] as const;
export type ActionKind = (typeof ACTION_KINDS)[number];

export interface Action {
  kind: ActionKind;
  collection: string;
  description: string;
}

export interface Contract {
  collections: Record<string, Collection>;
  actions: Record<string, Action>;
  /** Actions other apps may call (with the user's permission). */
  provides: string[];
  /** Actions of other apps this one calls: "app.action". */
  uses: string[];
}

export const NAME = /^[a-z][a-z0-9_]{0,31}$/;
const APP_ACTION = /^[a-z][a-z0-9-]{1,47}\.[a-z][a-z0-9_]{0,31}$/;

export const EMPTY_CONTRACT: Contract = { collections: {}, actions: {}, provides: [], uses: [] };

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** "string", "number?" … */
function parseField(name: string, raw: unknown): Field {
  if (typeof raw !== "string") throw new ContractError(`field ${name}: give a type as a string`);
  const optional = raw.endsWith("?");
  const type = optional ? raw.slice(0, -1) : raw;
  if (!(FIELD_TYPES as readonly string[]).includes(type))
    throw new ContractError(`field ${name}: type must be one of ${FIELD_TYPES.join(", ")}`);
  return { type: type as FieldType, optional };
}

export function validateContract(m: Record<string, unknown>): Contract {
  const collections: Record<string, Collection> = {};
  if (m.collections !== undefined) {
    if (!isRecord(m.collections)) throw new ContractError("collections must be a mapping");
    const entries = Object.entries(m.collections);
    if (entries.length > 32) throw new ContractError("at most 32 collections");
    for (const [name, spec] of entries) {
      if (!NAME.test(name))
        throw new ContractError(`collection "${name}": lowercase letters, digits, underscores`);
      const fields: Record<string, Field> = {};
      const rawFields = isRecord(spec) ? spec.fields : undefined;
      if (rawFields !== undefined) {
        if (!isRecord(rawFields))
          throw new ContractError(`collection ${name}: fields is a mapping`);
        for (const [field, type] of Object.entries(rawFields)) {
          if (!NAME.test(field) || field === "id")
            throw new ContractError(`collection ${name}: "${field}" is not a field name`);
          fields[field] = parseField(`${name}.${field}`, type);
        }
      }
      collections[name] = { fields };
    }
  }
  const actions: Record<string, Action> = {};
  if (m.actions !== undefined) {
    if (!isRecord(m.actions)) throw new ContractError("actions must be a mapping");
    for (const [name, spec] of Object.entries(m.actions)) {
      if (!NAME.test(name)) throw new ContractError(`action "${name}" is not a name`);
      if (!isRecord(spec)) throw new ContractError(`action ${name} must be a mapping`);
      if (!(ACTION_KINDS as readonly unknown[]).includes(spec.kind))
        throw new ContractError(`action ${name}: kind must be one of ${ACTION_KINDS.join(", ")}`);
      if (typeof spec.collection !== "string" || !(spec.collection in collections))
        throw new ContractError(`action ${name}: collection must be one of the app's collections`);
      const description = typeof spec.description === "string" ? spec.description.trim() : "";
      if (!description || description.length > 300)
        throw new ContractError(`action ${name}: a description (max 300 chars) is required`);
      actions[name] = { kind: spec.kind as ActionKind, collection: spec.collection, description };
    }
  }
  const list = (key: "provides" | "uses", pattern: RegExp): string[] => {
    const raw = m[key];
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.length > 64 || !raw.every((x) => typeof x === "string"))
      throw new ContractError(`${key} must be a list of names`);
    const bad = raw.find((x) => !pattern.test(x));
    if (bad)
      throw new ContractError(
        `${key}: "${bad}" is not ${key === "uses" ? "app.action" : "an action"}`,
      );
    return [...new Set(raw as string[])];
  };
  const provides = list("provides", NAME);
  const missing = provides.find((a) => !(a in actions));
  if (missing) throw new ContractError(`provides: "${missing}" is not one of the app's actions`);
  return { collections, actions, provides, uses: list("uses", APP_ACTION) };
}

/** Checks a record against its collection's schema; `partial` for updates. */
export function checkRecord(
  collection: string,
  spec: Collection | undefined,
  record: unknown,
  partial = false,
): Record<string, unknown> {
  if (!isRecord(record)) throw new ContractError(`a ${collection} record must be an object`);
  const { id: _id, ...data } = record;
  if (JSON.stringify(data).length > 256_000) throw new ContractError("a record is at most 256 KB");
  if (!spec || Object.keys(spec.fields).length === 0) return data;
  for (const key of Object.keys(data))
    if (!(key in spec.fields)) throw new ContractError(`${collection} has no field "${key}"`);
  for (const [key, field] of Object.entries(spec.fields)) {
    const value = data[key];
    if (value === undefined || value === null) {
      if (!partial && !field.optional) throw new ContractError(`${collection}.${key} is required`);
      continue;
    }
    const ok =
      field.type === "json" ||
      (field.type === "date"
        ? typeof value === "string" && !Number.isNaN(Date.parse(value))
        : typeof value === field.type);
    if (!ok) throw new ContractError(`${collection}.${key} must be a ${field.type}`);
  }
  return data;
}

/** What a manifest's data and actions mean, for approval cards. */
export function describeContract(c: Contract): string[] {
  return [
    ...Object.entries(c.actions).map(
      ([name, a]) =>
        `- action \`${name}\` (${a.kind} ${a.collection})${c.provides.includes(name) ? ", open to other apps" : ""}`,
    ),
    ...c.uses.map((u) => `- calls \`${u}\` of another app`),
  ];
}
