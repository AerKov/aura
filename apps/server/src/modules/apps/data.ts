import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { RecordId, type Surreal } from "surrealdb";
import { errorMessage, log } from "../../lib/log";
import type { EventHub } from "../realtime/hub";
import { type Contract, ContractError, checkRecord, NAME } from "./contract";

export type StoreKind = "database" | "files";

export type DataRecord = Record<string, unknown> & { id: string };

/** Where one app keeps its data: never Aura's main database (ADR 0024). */
export interface AppStore {
  all(collection: string): Promise<DataRecord[]>;
  put(collection: string, record: DataRecord): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  collections(): Promise<string[]>;
  clear(): Promise<void>;
  close(): Promise<void>;
}

/** Collections are tables or files; the prefix keeps names clear of reserved words. */
const table = (collection: string) => `c_${collection}`;
const KV = "_kv";
const MAX_RECORDS = 10_000;
const MAX_LIMIT = 500;

/** The app's own SurrealDB datastore (`state/apps/<id>`), separate from Aura's. */
export class DatabaseStore implements AppStore {
  constructor(private readonly db: Surreal) {}

  async all(collection: string): Promise<DataRecord[]> {
    let rows: Record<string, unknown>[] | undefined;
    try {
      [rows] = await this.db
        .query<[Record<string, unknown>[]]>("SELECT * FROM type::table($tb)", {
          tb: table(collection),
        })
        .collect();
    } catch (error) {
      // A collection nothing was written to yet has no table.
      if (/does not exist/i.test(errorMessage(error))) return [];
      throw error;
    }
    return (rows ?? []).map(({ id, ...rest }) => ({
      ...rest,
      id: id instanceof RecordId ? String(id.id) : String(id),
    }));
  }

  async put(collection: string, record: DataRecord): Promise<void> {
    const { id, ...data } = record;
    await this.db
      .query("UPSERT $id CONTENT $data", { id: new RecordId(table(collection), id), data })
      .collect();
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.db.query("DELETE $id", { id: new RecordId(table(collection), id) }).collect();
  }

  async collections(): Promise<string[]> {
    const [info] = await this.db
      .query<[{ tables?: Record<string, unknown> }]>("INFO FOR DB")
      .collect();
    return Object.keys(info?.tables ?? {})
      .filter((t) => t.startsWith("c_") || t === table(KV))
      .map((t) => t.slice(2));
  }

  async clear(): Promise<void> {
    for (const c of await this.collections()) {
      const tb = table(c);
      // REMOVE TABLE takes no parameter; the name is checked instead.
      if (!/^c_[a-z_][a-z0-9_]*$/.test(tb)) continue;
      await this.db.query(`REMOVE TABLE IF EXISTS ${tb}`).collect();
    }
  }

  async close(): Promise<void> {
    await this.db.close();
  }
}

/** JSON files in the app's `data/` folder (kept out of its code versions by .gitignore). */
export class FileStore implements AppStore {
  constructor(private readonly dir: string) {}

  private file(collection: string): string {
    return join(this.dir, `${collection}.json`);
  }

  async all(collection: string): Promise<DataRecord[]> {
    const file = this.file(collection);
    if (!existsSync(file)) return [];
    const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? (parsed as DataRecord[]) : [];
  }

  private async write(collection: string, records: DataRecord[]): Promise<void> {
    mkdirSync(this.dir, { recursive: true });
    const file = this.file(collection);
    // Write then rename, so a crash never leaves half a file.
    writeFileSync(`${file}.tmp`, `${JSON.stringify(records, null, 2)}\n`);
    renameSync(`${file}.tmp`, file);
  }

  async put(collection: string, record: DataRecord): Promise<void> {
    const records = await this.all(collection);
    const i = records.findIndex((r) => r.id === record.id);
    if (i >= 0) records[i] = record;
    else records.push(record);
    await this.write(collection, records);
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.write(
      collection,
      (await this.all(collection)).filter((r) => r.id !== id),
    );
  }

  async collections(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    return readdirSync(this.dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.slice(0, -5));
  }

  async clear(): Promise<void> {
    rmSync(this.dir, { recursive: true, force: true });
  }

  async close(): Promise<void> {}
}

export interface Query {
  /** Equality on fields. */
  where?: Record<string, unknown>;
  /** Case-insensitive text anywhere in the record's string fields. */
  search?: string;
  /** A field, "-field" for descending. */
  sort?: string;
  limit?: number;
}

export function applyQuery(records: DataRecord[], q: Query = {}): DataRecord[] {
  let out = records;
  if (q.where && Object.keys(q.where).length > 0) {
    const where = q.where;
    out = out.filter((r) => Object.entries(where).every(([k, v]) => r[k] === v));
  }
  if (q.search?.trim()) {
    const needle = q.search.trim().toLowerCase();
    out = out.filter((r) =>
      Object.values(r).some((v) => typeof v === "string" && v.toLowerCase().includes(needle)),
    );
  }
  if (q.sort) {
    const desc = q.sort.startsWith("-");
    const field = desc ? q.sort.slice(1) : q.sort;
    out = [...out].sort((a, b) => {
      const x = a[field];
      const y = b[field];
      const cmp =
        typeof x === "number" && typeof y === "number"
          ? x - y
          : String(x ?? "").localeCompare(String(y ?? ""));
      return desc ? -cmp : cmp;
    });
  }
  return out.slice(0, Math.min(q.limit ?? 100, MAX_LIMIT));
}

export class DataError extends Error {
  override name = "DataError";
}

/**
 * The data of apps built in Aura (ADR 0024, phase 24): each app has its own store, a separate
 * SurrealDB datastore or files, as the user chooses. Records are checked against the app's
 * declared collections; every change is announced so the app (and others) can refresh live.
 */
export class AppDataService {
  private readonly open = new Map<string, Promise<AppStore>>();

  constructor(
    private readonly deps: {
      hub: EventHub;
      /** The app's folder, or null when it is not an app. */
      dirOf: (app: string) => string | null;
      /** Where the user wants this app's data. */
      kindOf: (app: string) => Promise<StoreKind>;
      saveKind: (app: string, kind: StoreKind) => Promise<void>;
      /** Opens the app's own SurrealDB datastore. */
      openDatabase: (app: string) => Promise<Surreal>;
      /** Deletes the app's own database files, once it is closed. */
      removeDatabase?: (app: string) => void;
      contract: (app: string) => Promise<Contract>;
    },
  ) {}

  private async store(app: string, kind?: StoreKind): Promise<AppStore> {
    const dir = this.deps.dirOf(app);
    if (!dir) throw new DataError(`"${app}" is not an app built in Aura`);
    const chosen = kind ?? (await this.deps.kindOf(app));
    const key = `${app}:${chosen}`;
    let store = this.open.get(key);
    if (!store) {
      store =
        chosen === "files"
          ? Promise.resolve(new FileStore(join(dir, "data")))
          : this.deps.openDatabase(app).then((db) => new DatabaseStore(db));
      this.open.set(key, store);
      store.catch(() => this.open.delete(key));
    }
    return store;
  }

  /** A collection the app may use: declared ones when it declares any. */
  private async collection(app: string, name: string) {
    if (!NAME.test(name)) throw new DataError(`"${name}" is not a collection name`);
    const contract = await this.deps.contract(app);
    const declared = Object.keys(contract.collections);
    if (declared.length > 0 && !declared.includes(name))
      throw new DataError(`${app} has no collection "${name}" (it has ${declared.join(", ")})`);
    return contract.collections[name];
  }

  private changed(app: string, collection: string): void {
    this.deps.hub.publish({ type: "app.data", app, collection });
  }

  async list(app: string, collection: string, q?: Query): Promise<DataRecord[]> {
    await this.collection(app, collection);
    return applyQuery(await (await this.store(app)).all(collection), q);
  }

  async count(app: string, collection: string, q?: Query): Promise<number> {
    await this.collection(app, collection);
    return applyQuery(await (await this.store(app)).all(collection), { ...q, limit: MAX_RECORDS })
      .length;
  }

  async get(app: string, collection: string, id: string): Promise<DataRecord | null> {
    await this.collection(app, collection);
    return (await (await this.store(app)).all(collection)).find((r) => r.id === id) ?? null;
  }

  async insert(app: string, collection: string, record: unknown): Promise<DataRecord> {
    const spec = await this.collection(app, collection);
    const data = guard(() => checkRecord(collection, spec, record));
    const store = await this.store(app);
    if ((await store.all(collection)).length >= MAX_RECORDS)
      throw new DataError(`${collection} holds at most ${MAX_RECORDS} records`);
    const saved = { ...data, id: Bun.randomUUIDv7() };
    await store.put(collection, saved);
    this.changed(app, collection);
    return saved;
  }

  async update(app: string, collection: string, id: string, patch: unknown): Promise<DataRecord> {
    const spec = await this.collection(app, collection);
    const changes = guard(() => checkRecord(collection, spec, patch, true));
    const store = await this.store(app);
    const current = (await store.all(collection)).find((r) => r.id === id);
    if (!current) throw new DataError(`No ${collection} record ${id}`);
    const saved = { ...current, ...changes, id };
    guard(() => checkRecord(collection, spec, saved));
    await store.put(collection, saved);
    this.changed(app, collection);
    return saved;
  }

  async remove(app: string, collection: string, id: string): Promise<boolean> {
    await this.collection(app, collection);
    const store = await this.store(app);
    const exists = (await store.all(collection)).some((r) => r.id === id);
    if (exists) {
      await store.remove(collection, id);
      this.changed(app, collection);
    }
    return exists;
  }

  // The key-value `storage` API, kept in the app's own store too.

  async kvGet(app: string, key: string): Promise<unknown> {
    const rec = (await (await this.store(app)).all(KV)).find((r) => r.id === key);
    return rec ? rec.value : null;
  }

  async kvSet(app: string, key: string, value: unknown): Promise<void> {
    const store = await this.store(app);
    if (value === null || value === undefined) await store.remove(KV, key);
    else await store.put(KV, { id: key, value });
  }

  async kvKeys(app: string): Promise<string[]> {
    return (await (await this.store(app)).all(KV)).map((r) => r.id).sort();
  }

  /** Everything the app holds, for export or a move to another store. */
  async dump(app: string, kind?: StoreKind): Promise<Record<string, DataRecord[]>> {
    const store = await this.store(app, kind);
    const out: Record<string, DataRecord[]> = {};
    for (const c of await store.collections()) out[c] = await store.all(c);
    return out;
  }

  async info(
    app: string,
  ): Promise<{ store: StoreKind; collections: { name: string; count: number }[] }> {
    const dump = await this.dump(app);
    return {
      store: await this.deps.kindOf(app),
      collections: Object.entries(dump)
        .filter(([name]) => name !== KV)
        .map(([name, records]) => ({ name, count: records.length })),
    };
  }

  /** User action: deletes all of the app's data. */
  async clear(app: string): Promise<void> {
    await (await this.store(app)).clear();
    this.changed(app, "*");
  }

  /** User action: moves the app's data to the other kind of store. */
  async moveTo(app: string, kind: StoreKind): Promise<void> {
    const from = await this.deps.kindOf(app);
    if (from === kind) return;
    const data = await this.dump(app, from);
    const target = await this.store(app, kind);
    for (const [collection, records] of Object.entries(data))
      for (const record of records) await target.put(collection, record);
    await this.deps.saveKind(app, kind);
    await (await this.store(app, from)).clear();
    log.info("app data moved", { app, from, to: kind });
    this.changed(app, "*");
  }

  /** Puts back data from a dump: the app's store then holds exactly that (backups, ADR 0033). */
  async replace(app: string, data: Record<string, DataRecord[]>): Promise<void> {
    const store = await this.store(app);
    await store.clear();
    for (const [collection, records] of Object.entries(data))
      for (const record of records) await store.put(collection, record);
    this.changed(app, "*");
  }

  /** Clears and closes an app's stores before the app is removed. */
  async forget(app: string): Promise<void> {
    await (await this.store(app)).clear();
    for (const [key, store] of this.open) {
      if (!key.startsWith(`${app}:`)) continue;
      this.open.delete(key);
      await store
        .then((s) => s.close())
        .catch((e: unknown) => log.warn("store close failed", { app, error: errorMessage(e) }));
    }
    this.deps.removeDatabase?.(app);
  }

  async closeAll(): Promise<void> {
    for (const store of this.open.values())
      await store
        .then((s) => s.close())
        .catch((e: unknown) => log.warn("store close failed", { error: errorMessage(e) }));
    this.open.clear();
  }
}

function guard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ContractError) throw new DataError(error.message);
    throw error;
  }
}
