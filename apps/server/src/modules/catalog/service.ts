import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { PackPreview, PackSummary } from "@aura/shared";
import { unifiedDiff } from "../../lib/diff";
import { commitAll } from "../../lib/git";
import { errorMessage, log } from "../../lib/log";
import { parseAgentFile } from "../agents/profiles";
import type { ApprovalRecord, ApprovalService } from "../approvals/service";
import type { ExtensionService } from "../customize/extensions";
import { PERMISSIONS, validateManifest } from "../customize/extensions";
import type { EventHub } from "../realtime/hub";
import { contentsOf, type Pack, PackError, packHash, validatePack } from "./pack";
import { BUILTIN_PACKS } from "./packs";
import { fetchPack } from "./source";

/** `catalog.json` in the data dir: what was installed from where (config in files, committed). */
interface InstalledPack {
  version: string;
  sha256: string;
  source: "builtin" | "url";
  url: string | null;
  files: string[];
}

/** A pack reference: a built-in id, or an https URL. */
export type PackRef = { id: string } | { url: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The catalog (ADR 0016): built-in packs and packs from a URL. Installing writes the pack's files into
 * the user data directory as one git commit, after the user saw exactly what changes (a preview with
 * diffs) — either on the Catalog screen or as an approval card the orchestrator requested.
 */
export class CatalogService {
  private readonly builtin: Map<string, Pack>;

  constructor(
    private readonly deps: {
      dataDir: string;
      approvals: ApprovalService;
      extensions: ExtensionService;
      hub: EventHub;
      fetch?: typeof fetch;
    },
  ) {
    this.builtin = new Map();
    for (const raw of BUILTIN_PACKS) {
      try {
        const pack = validatePack(raw.manifest, raw.files);
        this.builtin.set(pack.manifest.id, pack);
      } catch (error) {
        log.error("invalid built-in pack", { error: errorMessage(error) });
      }
    }
    deps.approvals.register("pack_install", async (payload, ctx) =>
      this.installApproved(payload, ctx.requestedBy),
    );
  }

  private get lockFile(): string {
    return join(this.deps.dataDir, "catalog.json");
  }

  private installed(): Record<string, InstalledPack> {
    if (!existsSync(this.lockFile)) return {};
    try {
      const raw: unknown = JSON.parse(readFileSync(this.lockFile, "utf8"));
      return isRecord(raw) && isRecord(raw.installed)
        ? (raw.installed as Record<string, InstalledPack>)
        : {};
    } catch (error) {
      log.warn("catalog.json is unreadable", { error: errorMessage(error) });
      return {};
    }
  }

  private summary(pack: Pack, source: "builtin" | "url", url: string | null): PackSummary {
    const m = pack.manifest;
    const lock = this.installed()[m.id];
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      description: m.description,
      author: m.author,
      tags: m.tags,
      source,
      url,
      contents: contentsOf(m.files),
      installed: lock ? { version: lock.version, sha256: lock.sha256 } : null,
    };
  }

  list(): PackSummary[] {
    return [...this.builtin.values()].map((p) => this.summary(p, "builtin", null));
  }

  private async load(
    ref: PackRef,
  ): Promise<{ pack: Pack; source: "builtin" | "url"; url: string | null }> {
    if ("id" in ref) {
      const pack = this.builtin.get(ref.id);
      if (!pack) throw new PackError(`No built-in pack "${ref.id}"`);
      return { pack, source: "builtin", url: null };
    }
    return { pack: await fetchPack(ref.url, this.deps.fetch), source: "url", url: ref.url };
  }

  /** What installing would do: every file, new or replaced (with a diff), and what to watch for. */
  async preview(ref: PackRef): Promise<PackPreview> {
    const { pack, source, url } = await this.load(ref);
    return this.describe(pack, source, url);
  }

  private describe(pack: Pack, source: "builtin" | "url", url: string | null): PackPreview {
    const m = pack.manifest;
    const warnings: string[] = [];
    const lines: string[] = [
      `**${m.name}** ${m.version} by ${m.author}${url ? ` from ${url}` : " (built in)"}`,
      "",
      m.description,
      "",
    ];
    for (const path of m.files) {
      const content = pack.files[path] ?? "";
      const target = join(this.deps.dataDir, path);
      const before = existsSync(target) ? readFileSync(target, "utf8") : null;
      if (before === content) {
        lines.push(`- \`${path}\`: unchanged`);
        continue;
      }
      if (path.startsWith("agents/")) {
        const profile = parseAgentFile(path.split("/")[1] ?? "", content);
        lines.push(
          `- \`${path}\`: ${before === null ? "new" : "replaces"} agent **@${profile.handle}**: ${profile.role} · tools: ${profile.builtinTools.join(", ") || "none"}`,
        );
        if (profile.builtinTools.includes("Bash"))
          warnings.push(`@${profile.handle} gets a shell (Bash).`);
      } else if (path.endsWith("/manifest.json") && path.startsWith("extensions/")) {
        const manifest = validateManifest(JSON.parse(content), path.split("/")[1]);
        lines.push(
          `- \`${path}\`: ${before === null ? "new" : "replaces"} extension **${manifest.name}**, asks for: ${manifest.permissions.map((p) => `\`${p}\` (${PERMISSIONS[p]})`).join(", ") || "nothing"}`,
        );
        if (manifest.permissions.includes("chat.write"))
          warnings.push(`Extension ${manifest.name} can post messages.`);
        if (manifest.hosts?.length)
          warnings.push(
            `Extension ${manifest.name} can reach ${manifest.hosts.join(", ")}${manifest.secrets?.length ? ` with secrets ${manifest.secrets.join(", ")}` : ""}.`,
          );
        if (manifest.permissions.includes("agents.ask"))
          warnings.push(`Extension ${manifest.name} can ask agents for you (spends budget).`);
      } else {
        lines.push(`- \`${path}\`: ${before === null ? "new" : "replaces the existing file"}`);
      }
      if (before !== null) {
        warnings.push(`${path} already exists and will be replaced.`);
        lines.push("", "```diff", unifiedDiff(before, content, path), "```", "");
      }
    }
    if (source === "url")
      warnings.push(
        "This pack is not from the built-in catalog. Read its files before installing.",
      );
    return {
      ...this.summary(pack, source, url),
      sha256: packHash(pack),
      preview: lines.join("\n"),
      warnings,
    };
  }

  /** User action on the Catalog screen, after seeing the preview with this exact hash. */
  async install(ref: PackRef, expectedSha256: string, by = "owner"): Promise<string> {
    const { pack, source, url } = await this.load(ref);
    if (packHash(pack) !== expectedSha256)
      throw new PackError("The pack changed since you previewed it. Review it again.");
    return this.write(pack, source, url, by);
  }

  /** An agent asks to install a pack: the user approves the preview as a card. */
  async request(
    ref: PackRef,
    by: { requestedBy: string; chatId: string; topicId?: string | null; why: string },
  ): Promise<ApprovalRecord> {
    const { pack, source, url } = await this.load(ref);
    const preview = this.describe(pack, source, url);
    return this.deps.approvals.request({
      kind: "pack_install",
      requestedBy: by.requestedBy,
      chatId: by.chatId,
      topicId: by.topicId,
      title: `Install pack "${pack.manifest.name}" ${pack.manifest.version}`,
      why: by.why,
      preview: [
        preview.preview,
        ...(preview.warnings.length > 0
          ? ["", "**Check:**", ...preview.warnings.map((w) => `- ${w}`)]
          : []),
      ].join("\n"),
      // The approved content itself, so what runs is exactly what was shown.
      payload: { manifest: pack.manifest, files: pack.files, source, url, sha256: preview.sha256 },
    });
  }

  private async installApproved(payload: Record<string, unknown>, author: string): Promise<string> {
    const pack = validatePack(payload.manifest, (payload.files ?? {}) as Record<string, string>);
    if (packHash(pack) !== payload.sha256)
      throw new PackError("The approved content does not match.");
    return this.write(
      pack,
      payload.source === "url" ? "url" : "builtin",
      typeof payload.url === "string" ? payload.url : null,
      author,
    );
  }

  private async write(
    pack: Pack,
    source: "builtin" | "url",
    url: string | null,
    author: string,
  ): Promise<string> {
    const m = pack.manifest;
    for (const path of m.files) {
      const target = join(this.deps.dataDir, path);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, pack.files[path] ?? "");
    }
    const installed = this.installed();
    installed[m.id] = { version: m.version, sha256: packHash(pack), source, url, files: m.files };
    writeFileSync(this.lockFile, `${JSON.stringify({ installed }, null, 2)}\n`);
    await commitAll(this.deps.dataDir, `pack(${m.id}): install ${m.version}`, author);
    // The user saw each extension's permissions in the preview, so they are enabled with them.
    for (const id of contentsOf(m.files).extensions)
      await this.deps.extensions.setEnabled(id, true);
    this.deps.hub.publish({ type: "customize.updated" });
    const c = contentsOf(m.files);
    const parts = [
      c.agents.length ? `agents ${c.agents.map((a) => `@${a}`).join(", ")}` : "",
      c.skills.length ? `skills ${c.skills.join(", ")}` : "",
      c.themes.length ? `themes ${c.themes.join(", ")}` : "",
      c.snippets.length ? `snippets ${c.snippets.join(", ")}` : "",
      c.extensions.length ? `extensions ${c.extensions.join(", ")}` : "",
    ].filter(Boolean);
    return `Installed "${m.name}" ${m.version}: ${parts.join("; ")}.`;
  }
}
