import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type Appearance,
  BAR_EDGES,
  type BarEdge,
  normalizeWindowStyle,
  RAIL_PINNED,
  type RailLayout,
  type WindowStyle,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { unifiedDiff } from "../../lib/diff";
import { commitAll } from "../../lib/git";
import type { ApprovalRecord, ApprovalService } from "../approvals/service";
import type { EventHub } from "../realtime/hub";
import { ASSET_NAME_PATTERN, MAX_CSS, sanitizeCss } from "./css";

export class AppearanceError extends Error {
  override name = "AppearanceError";
}

export interface CssChange {
  target: "theme" | "snippet";
  name: string;
  css: string;
  activate: boolean;
}

const SETTING = new RecordId("setting", "appearance");

const RAIL_KEY = /^(ext:)?[a-z][a-z0-9-]{0,47}$/;

/** Rail item keys: page names ("skills") and extensions ("ext:<id>"); unknown ones are kept. */
function railKeys(keys: string[]): string[] {
  const bad = keys.find((k) => !RAIL_KEY.test(k));
  if (bad) throw new AppearanceError(`"${bad}" is not a rail item`);
  if (keys.length > 64) throw new AppearanceError("too many rail items");
  return [...new Set(keys)];
}

/** Tier 1 customization: themes (`themes/<name>/theme.css`) and snippets (`snippets/<name>.css`). */
export class AppearanceService {
  constructor(
    private readonly deps: {
      db: Surreal;
      dataDir: string;
      approvals: ApprovalService;
      hub: EventHub;
    },
  ) {
    deps.approvals.register("theme_change", async (payload, ctx) =>
      this.apply(payload as unknown as CssChange, ctx.requestedBy),
    );
  }

  private fileOf(target: CssChange["target"], name: string): string {
    return target === "theme"
      ? join(this.deps.dataDir, "themes", name, "theme.css")
      : join(this.deps.dataDir, "snippets", `${name}.css`);
  }

  private read(target: CssChange["target"], name: string): string | null {
    const file = this.fileOf(target, name);
    return existsSync(file) ? readFileSync(file, "utf8") : null;
  }

  themes(): string[] {
    const dir = join(this.deps.dataDir, "themes");
    if (!existsSync(dir)) return [];
    return readdirSync(dir, { withFileTypes: true })
      .filter(
        (e) =>
          e.isDirectory() &&
          ASSET_NAME_PATTERN.test(e.name) &&
          existsSync(join(dir, e.name, "theme.css")),
      )
      .map((e) => e.name)
      .sort();
  }

  snippets(): string[] {
    const dir = join(this.deps.dataDir, "snippets");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".css") && ASSET_NAME_PATTERN.test(f.slice(0, -4)))
      .map((f) => f.slice(0, -4))
      .sort();
  }

  private async settings(): Promise<{
    theme: string | null;
    snippets: string[];
    rail: RailLayout;
    wm: WindowStyle;
  }> {
    const [rows] = await this.deps.db
      .query<
        [{ theme?: string | null; snippets?: string[]; rail?: Partial<RailLayout>; wm?: unknown }[]]
      >("SELECT * FROM setting WHERE id = $id", { id: SETTING })
      .collect();
    const row = rows?.[0];
    return {
      theme: row?.theme ?? null,
      snippets: row?.snippets ?? [],
      rail: {
        order: row?.rail?.order ?? [],
        hidden: row?.rail?.hidden ?? [],
        edge: BAR_EDGES.includes(row?.rail?.edge as BarEdge)
          ? (row?.rail?.edge as BarEdge)
          : "left",
      },
      wm: normalizeWindowStyle(row?.wm),
    };
  }

  async get(): Promise<Appearance> {
    const { theme, snippets, rail, wm } = await this.settings();
    const themes = this.themes();
    const available = this.snippets();
    const css: { name: string; css: string }[] = [];
    if (theme && themes.includes(theme))
      css.push({ name: `theme:${theme}`, css: sanitizeCss(this.read("theme", theme) ?? "") });
    for (const s of snippets.filter((n) => available.includes(n))) {
      css.push({ name: `snippet:${s}`, css: sanitizeCss(this.read("snippet", s) ?? "") });
    }
    return { theme, snippets, themes, availableSnippets: available, css, rail, wm };
  }

  /**
   * Switches the theme and snippets among files that already exist, arranges the bar and sets how
   * tiles look (ADR 0028). Harmless and reversible.
   */
  async set(input: {
    theme?: string | null;
    snippets?: string[];
    rail?: Partial<RailLayout>;
    wm?: Partial<WindowStyle>;
  }): Promise<Appearance> {
    const current = await this.settings();
    const theme = input.theme === undefined ? current.theme : input.theme;
    if (theme !== null && !this.themes().includes(theme))
      throw new AppearanceError(`unknown theme "${theme}"`);
    const snippets = input.snippets ?? current.snippets;
    const unknown = snippets.filter((s) => !this.snippets().includes(s));
    if (unknown.length > 0) throw new AppearanceError(`unknown snippets: ${unknown.join(", ")}`);
    const rail = {
      order: railKeys(input.rail?.order ?? current.rail.order),
      // Chats and Customize stay, so the user can always get back.
      hidden: railKeys(input.rail?.hidden ?? current.rail.hidden).filter(
        (k) => !RAIL_PINNED.includes(k),
      ),
      edge: input.rail?.edge ?? current.rail.edge,
    };
    if (!BAR_EDGES.includes(rail.edge)) throw new AppearanceError(`"${rail.edge}" is not an edge`);
    const wm = normalizeWindowStyle({ ...current.wm, ...input.wm }, current.wm);
    await this.deps.db
      .query("UPSERT $id CONTENT { theme: $theme, snippets: $snippets, rail: $rail, wm: $wm }", {
        id: SETTING,
        theme,
        snippets,
        rail,
        wm,
      })
      .collect();
    this.deps.hub.publish({ type: "customize.updated" });
    return this.get();
  }

  async propose(
    change: CssChange,
    by: { requestedBy: string; chatId: string; topicId?: string | null; why: string },
  ): Promise<ApprovalRecord> {
    if (!ASSET_NAME_PATTERN.test(change.name))
      throw new AppearanceError("name must be 2-48 chars: lowercase letters, digits, dashes");
    if (!change.css.trim() || change.css.length > MAX_CSS)
      throw new AppearanceError("css is required (max 100 KB)");
    const path =
      change.target === "theme" ? `themes/${change.name}/theme.css` : `snippets/${change.name}.css`;
    const before = this.read(change.target, change.name) ?? "";
    const diff = unifiedDiff(before, change.css, path);
    if (!diff) throw new AppearanceError("the proposed CSS is identical");
    return this.deps.approvals.request({
      kind: "theme_change",
      requestedBy: by.requestedBy,
      chatId: by.chatId,
      topicId: by.topicId,
      title: `${before ? "Update" : "New"} ${change.target} "${change.name}"${change.activate ? " (and use it)" : ""}`,
      why: by.why,
      preview: `\`\`\`diff\n${diff}\n\`\`\``,
      payload: { ...change },
      tryCss: sanitizeCss(change.css),
    });
  }

  private async apply(change: CssChange, author: string): Promise<string> {
    const file = this.fileOf(change.target, change.name);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, change.css.endsWith("\n") ? change.css : `${change.css}\n`);
    await commitAll(this.deps.dataDir, `${change.target}(${change.name}): update`, author);
    if (change.activate) {
      const current = await this.settings();
      await this.set(
        change.target === "theme"
          ? { theme: change.name }
          : { snippets: [...new Set([...current.snippets, change.name])] },
      );
    } else {
      this.deps.hub.publish({ type: "customize.updated" });
    }
    return `${change.target === "theme" ? "Theme" : "Snippet"} "${change.name}" saved${change.activate ? " and applied" : ""}.`;
  }
}
