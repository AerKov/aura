/**
 * Built-in apps of the core (ADR 0027): Aura is a core (SurrealDB, the shell, the app runtime,
 * catalog, approvals, appearance) plus apps. These built-in ones can be turned off like any other;
 * turned off, their routes answer 404, their background work stops and agents lose their tools.
 */
import type { AppRef } from "./layout";

export const MODULE_IDS = ["chats", "skills", "memory", "jobs", "alerts", "integrations"] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

export interface ModuleSpec {
  name: string;
  description: string;
  /** Modules it cannot work without. */
  requires: ModuleId[];
}

export const MODULES: Record<ModuleId, ModuleSpec> = {
  chats: {
    name: "Chats",
    description:
      "The messenger with the orchestrator and AI agents, and every app's chat for changing it.",
    requires: [],
  },
  skills: { name: "Skills", description: "Know-how your agents can use.", requires: ["chats"] },
  memory: { name: "Memory", description: "What your agents remember.", requires: ["chats"] },
  jobs: { name: "Schedule", description: "Agents' work on a schedule.", requires: ["chats"] },
  alerts: {
    name: "Signals",
    description: "Alerts from monitoring tools, triaged by the orchestrator.",
    requires: ["chats"],
  },
  integrations: {
    name: "Integrations",
    description: "MCP servers, secrets and variables for agents and apps.",
    requires: [],
  },
};

/** Which built-in modules are on. Everything is on by default. */
export type ModuleStates = Record<ModuleId, boolean>;

export function defaultModules(): ModuleStates {
  return Object.fromEntries(MODULE_IDS.map((id) => [id, true])) as ModuleStates;
}

export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === "string" && (MODULE_IDS as readonly string[]).includes(value);
}

/** The module an app belongs to; null for the core's own apps (home, catalog, customize…). */
export function moduleOfApp(app: AppRef): ModuleId | null {
  switch (app) {
    case "messenger":
    case "page:agents":
    case "page:engines":
      return "chats";
    case "page:skills":
      return "skills";
    case "page:memory":
      return "memory";
    case "page:jobs":
      return "jobs";
    case "page:integrations":
      return "integrations";
    default:
      return null;
  }
}

/**
 * Turns a module on or off. Turning one on turns on what it requires; turning one off turns off
 * what requires it. Returns the new states and every module that changed.
 */
export function switchModule(
  states: ModuleStates,
  id: ModuleId,
  enabled: boolean,
): { states: ModuleStates; changed: ModuleId[] } {
  const next = { ...states };
  const changed: ModuleId[] = [];
  const set = (m: ModuleId) => {
    if (next[m] === enabled) return;
    next[m] = enabled;
    changed.push(m);
    const related = enabled
      ? MODULES[m].requires
      : MODULE_IDS.filter((other) => MODULES[other].requires.includes(m));
    related.forEach(set);
  };
  set(id);
  return { states: next, changed };
}
