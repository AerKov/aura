import {
  type AppRef,
  closeApp,
  defaultLayout,
  type Layout,
  openApp,
  type Placement,
  prune,
  validateLayout,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { errorMessage, log } from "../../lib/log";
import type { ExtensionService } from "../customize/extensions";
import type { EventHub } from "../realtime/hub";

const SETTING = new RecordId("setting", "layout");

/**
 * The shell's layout (ADR 0024): which apps are open as tiles. One layout per install, saved in the
 * database so every window and the orchestrator see the same screen.
 */
export class LayoutService {
  constructor(
    private readonly deps: { db: Surreal; hub: EventHub; extensions: ExtensionService },
  ) {}

  /** Apps that can open now: the messenger, the pages, and enabled extensions with a panel. */
  private async exists(): Promise<(app: AppRef) => boolean> {
    const panels = new Set(
      (await this.deps.extensions.list())
        .filter((e) => e.enabled && e.permissions.includes("ui.panel"))
        .map((e) => `ext:${e.id}`),
    );
    return (app) => !app.startsWith("ext:") || panels.has(app);
  }

  async get(): Promise<Layout> {
    const [rows] = await this.deps.db
      .query<[{ layout?: unknown }[]]>("SELECT * FROM setting WHERE id = $id", { id: SETTING })
      .collect();
    let layout = defaultLayout();
    const stored = rows?.[0]?.layout;
    if (stored) {
      try {
        layout = validateLayout(stored);
      } catch (error) {
        log.warn("stored layout is invalid; using the default", { error: errorMessage(error) });
      }
    }
    return prune(layout, await this.exists());
  }

  async set(raw: unknown): Promise<Layout> {
    const layout = prune(validateLayout(raw), await this.exists());
    await this.deps.db
      .query("UPSERT $id CONTENT { layout: $layout }", { id: SETTING, layout })
      .collect();
    this.deps.hub.publish({ type: "layout.updated", layout });
    return layout;
  }

  async open(app: AppRef, where: Placement = "here"): Promise<Layout> {
    if (!(await this.exists())(app)) throw new Error(`${app} is not installed or not enabled`);
    return this.set(openApp(await this.get(), app, where));
  }

  async close(app: AppRef): Promise<Layout> {
    return this.set(closeApp(await this.get(), app));
  }
}
