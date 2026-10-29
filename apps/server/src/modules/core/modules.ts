import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  defaultModules,
  isModuleId,
  MODULE_IDS,
  MODULES,
  type ModuleId,
  type ModuleStates,
  switchModule,
} from "@aura/shared";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import type { EventHub } from "../realtime/hub";

const FILE = "modules.json";

/**
 * Routes of each built-in module (ADR 0027): a turned-off module answers 404 on them. Everything
 * else (sessions, layout, apps, catalog, approvals, appearance, devices) is the core.
 */
const ROUTES: [RegExp, ModuleId][] = [
  [
    /^\/(chats|messages|agents|engines|provider|projects|tasks|runs|sandbox|mcp\/runs)(\/|$)/,
    "chats",
  ],
  // An app posting to or asking in chats.
  [/^\/extensions\/[^/]+\/(ask|messages)$/, "chats"],
  [/^\/extensions\/[^/]+\/alerts$/, "alerts"],
  // A new empty app is made by @builder in its chat.
  [/^\/apps$/, "chats"],
  [/^\/skills(\/|$)/, "skills"],
  [/^\/memory(\/|$)/, "memory"],
  [/^\/jobs(\/|$)/, "jobs"],
  [/^\/hooks(\/|$)/, "alerts"],
];

/** Agent tools that belong to a module; agents lose them while it is off. */
const TOOLS: Record<string, ModuleId> = {
  propose_skill_change: "skills",
  remember: "memory",
  recall: "memory",
  forget: "memory",
  list_jobs: "jobs",
  schedule_job: "jobs",
};

export function moduleOfRoute(path: string): ModuleId | null {
  return ROUTES.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

export class ModuleError extends Error {
  override name = "ModuleError";
}

/**
 * Which built-in apps are on (ADR 0027). Config, so a file in the user data directory
 * (`modules.json`, committed like any other change); everything is on when it is missing.
 */
export class ModuleService {
  private states: ModuleStates;
  private readonly listeners = new Set<(states: ModuleStates, changed: ModuleId[]) => void>();

  constructor(private readonly deps: { dataDir: string; hub?: EventHub }) {
    this.states = this.load();
  }

  private load(): ModuleStates {
    const states = defaultModules();
    const file = join(this.deps.dataDir, FILE);
    if (!existsSync(file)) return states;
    try {
      const raw: unknown = JSON.parse(readFileSync(file, "utf8"));
      const off =
        raw && typeof raw === "object" && Array.isArray((raw as { off?: unknown }).off)
          ? (raw as { off: unknown[] }).off.filter(isModuleId)
          : [];
      for (const id of off) states[id] = false;
      // A hand-edited file may turn off a module others need: those go off too.
      let fixed = states;
      for (const id of off) fixed = switchModule(fixed, id, false).states;
      return fixed;
    } catch (error) {
      log.warn("modules.json is unreadable; every built-in app is on", {
        error: errorMessage(error),
      });
      return states;
    }
  }

  all(): ModuleStates {
    return { ...this.states };
  }

  enabled(id: ModuleId): boolean {
    return this.states[id];
  }

  /** Whether a route may answer now. */
  allows(path: string): ModuleId | null {
    const id = moduleOfRoute(path);
    return id && !this.states[id] ? id : null;
  }

  /** Drops the tools of modules that are off. */
  filterTools<T extends { name: string }>(tools: T[]): T[] {
    return tools.filter((t) => {
      const id = TOOLS[t.name];
      return !id || this.states[id];
    });
  }

  /** Called after a change, with every module that changed (to start or stop their work). */
  onChange(listener: (states: ModuleStates, changed: ModuleId[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Reads `modules.json` again (a restore point put it back), starting or stopping what changed. */
  reload(): void {
    const before = this.states;
    this.states = this.load();
    const changed = MODULE_IDS.filter((m) => before[m] !== this.states[m]);
    if (changed.length === 0) return;
    for (const listener of this.listeners) listener(this.all(), changed);
    this.deps.hub?.publish({ type: "customize.updated" });
  }

  /** Turns a module on or off, with what it requires or what requires it. */
  async set(
    id: ModuleId,
    enabled: boolean,
  ): Promise<{ modules: ModuleStates; changed: ModuleId[] }> {
    if (!isModuleId(id)) throw new ModuleError(`unknown app "${id}"`);
    const { states, changed } = switchModule(this.states, id, enabled);
    if (changed.length === 0) return { modules: this.all(), changed };
    this.states = states;
    const off = MODULE_IDS.filter((m) => !states[m]);
    writeFileSync(join(this.deps.dataDir, FILE), `${JSON.stringify({ off }, null, 2)}\n`);
    const names = changed.map((m) => MODULES[m].name).join(", ");
    await commitAll(this.deps.dataDir, `chore: turn ${enabled ? "on" : "off"} ${names}`).catch(
      (error: unknown) => log.warn("could not commit modules.json", { error: errorMessage(error) }),
    );
    log.info("built-in apps changed", { enabled, changed });
    for (const listener of this.listeners) listener(this.all(), changed);
    this.deps.hub?.publish({ type: "customize.updated" });
    return { modules: this.all(), changed };
  }
}
