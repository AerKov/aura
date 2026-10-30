import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  BUILTIN_LOCALES,
  LOCALE_CODE,
  type LocaleInfo,
  type LocalizationState,
} from "@aura/shared";
import { RecordId, type Surreal } from "surrealdb";
import { errorMessage, log } from "../../../lib/log";
import type { EventHub } from "../realtime/hub";

export class LocalizationError extends Error {
  override name = "LocalizationError";
}

const SETTING = new RecordId("setting", "localization");
const MAX_STRINGS = 5000;

interface LocaleFile {
  name: string;
  englishName: string;
  strings: Record<string, string>;
}

/**
 * The Localization app (ADR 0033): which language Aura speaks. The choice is a setting (in restore
 * points); languages beyond the built-in ones, and corrections to them, are files in
 * `locales/<code>.json` of the user data dir: `{ name, englishName, strings: { "English text":
 * "translation" } }`.
 */
export class LocalizationService {
  private choice: string | null = null;

  constructor(private readonly deps: { db: Surreal; dataDir: string; hub: EventHub }) {}

  private get dir(): string {
    return join(this.deps.dataDir, "locales");
  }

  private readFile(code: string): LocaleFile | null {
    const file = join(this.dir, `${code}.json`);
    if (!LOCALE_CODE.test(code) || !existsSync(file)) return null;
    try {
      const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<LocaleFile>;
      const strings = Object.fromEntries(
        Object.entries(raw.strings ?? {})
          .filter(([k, v]) => typeof k === "string" && typeof v === "string")
          .slice(0, MAX_STRINGS),
      );
      return {
        name: typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : code,
        englishName:
          typeof raw.englishName === "string" && raw.englishName.trim()
            ? raw.englishName.trim()
            : code,
        strings,
      };
    } catch (error) {
      log.warn("locale file is not valid JSON", { code, error: errorMessage(error) });
      return null;
    }
  }

  available(): LocaleInfo[] {
    const files = existsSync(this.dir)
      ? readdirSync(this.dir)
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.slice(0, -5))
          .filter((code) => LOCALE_CODE.test(code))
      : [];
    const builtin = new Set(BUILTIN_LOCALES.map((l) => l.code));
    const own = files
      .filter((code) => !builtin.has(code))
      .flatMap((code) => {
        const file = this.readFile(code);
        return file
          ? [{ code, name: file.name, englishName: file.englishName, builtin: false }]
          : [];
      });
    return [...BUILTIN_LOCALES, ...own];
  }

  async get(): Promise<LocalizationState> {
    if (this.choice === null) {
      const [rows] = await this.deps.db
        .query<[{ choice?: string }[]]>("SELECT choice FROM setting WHERE id = $id", {
          id: SETTING,
        })
        .collect();
      this.choice = rows?.[0]?.choice ?? "auto";
    }
    const available = this.available();
    const choice =
      this.choice === "auto" || available.some((l) => l.code === this.choice)
        ? this.choice
        : "auto";
    return { choice, available };
  }

  /** User action (or the orchestrator on request): sets the language. */
  async set(choice: string): Promise<LocalizationState> {
    if (choice !== "auto" && !this.available().some((l) => l.code === choice))
      throw new LocalizationError(
        `No language "${choice}". Available: ${this.available()
          .map((l) => l.code)
          .join(", ")}`,
      );
    await this.deps.db
      .query("UPSERT $id CONTENT { choice: $choice }", { id: SETTING, choice })
      .collect();
    this.choice = choice;
    this.deps.hub.publish({ type: "customize.updated" });
    return this.get();
  }

  /** Forgets the cached choice (a restore point put the setting back). */
  reload(): void {
    this.choice = null;
  }

  /** Strings from a locale file: a whole language, or corrections to a built-in one. */
  strings(code: string): Record<string, string> {
    return this.readFile(code)?.strings ?? {};
  }

  /** The language agents answer in, or null to follow the user's own messages. */
  async agentLanguage(): Promise<string | null> {
    const { choice, available } = await this.get();
    if (choice === "auto") return null;
    return available.find((l) => l.code === choice)?.englishName ?? null;
  }
}
