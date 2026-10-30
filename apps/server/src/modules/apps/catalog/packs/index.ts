/// <reference path="../../../../providers/vendor-files.d.ts" />
/**
 * The built-in catalog (ADR 0016). Files are imported as text (manifests as JSON) so they are
 * embedded in the compiled sidecar; each pack is validated like any other pack before it is offered.
 */

// `.txt` so that tools treat the extension's code as content, not as part of the server.
import alertsMain from "./alerts-panel/extensions/alerts-today/main.js.txt" with { type: "text" };
import alertsManifest from "./alerts-panel/extensions/alerts-today/manifest.json";
import alertsStyles from "./alerts-panel/extensions/alerts-today/styles.css" with { type: "text" };
import alertsPack from "./alerts-panel/pack.json";
import coder from "./dev-team/agents/coder/agent.md" with { type: "text" };
import reviewer from "./dev-team/agents/reviewer/agent.md" with { type: "text" };
import devPack from "./dev-team/pack.json";
import testFirst from "./dev-team/skills/test-first/SKILL.md" with { type: "text" };
import oncall from "./ops/agents/oncall/agent.md" with { type: "text" };
import opsPack from "./ops/pack.json";
import incidentTriage from "./ops/skills/incident-triage/SKILL.md" with { type: "text" };
import researcher from "./research/agents/researcher/agent.md" with { type: "text" };
import researchPack from "./research/pack.json";
import citeSources from "./research/skills/cite-sources/SKILL.md" with { type: "text" };
import themesPack from "./themes/pack.json";
import compact from "./themes/snippets/compact.css" with { type: "text" };
import forest from "./themes/themes/forest/theme.css" with { type: "text" };
import midnight from "./themes/themes/midnight/theme.css" with { type: "text" };
import paper from "./themes/themes/paper/theme.css" with { type: "text" };
import editor from "./writing-team/agents/editor/agent.md" with { type: "text" };
import writer from "./writing-team/agents/writer/agent.md" with { type: "text" };
import writingPack from "./writing-team/pack.json";
import plainLanguage from "./writing-team/skills/plain-language/SKILL.md" with { type: "text" };

export interface RawPack {
  /** The parsed `pack.json`, validated before use. */
  manifest: unknown;
  files: Record<string, string>;
}

export const BUILTIN_PACKS: RawPack[] = [
  {
    manifest: devPack,
    files: {
      "agents/coder/agent.md": coder,
      "agents/reviewer/agent.md": reviewer,
      "skills/test-first/SKILL.md": testFirst,
    },
  },
  {
    manifest: writingPack,
    files: {
      "agents/writer/agent.md": writer,
      "agents/editor/agent.md": editor,
      "skills/plain-language/SKILL.md": plainLanguage,
    },
  },
  {
    manifest: researchPack,
    files: {
      "agents/researcher/agent.md": researcher,
      "skills/cite-sources/SKILL.md": citeSources,
    },
  },
  {
    manifest: opsPack,
    files: {
      "agents/oncall/agent.md": oncall,
      "skills/incident-triage/SKILL.md": incidentTriage,
    },
  },
  {
    manifest: themesPack,
    files: {
      "themes/paper/theme.css": paper,
      "themes/midnight/theme.css": midnight,
      "themes/forest/theme.css": forest,
      "snippets/compact.css": compact,
    },
  },
  {
    manifest: alertsPack,
    files: {
      "extensions/alerts-today/manifest.json": `${JSON.stringify(alertsManifest, null, 2)}\n`,
      "extensions/alerts-today/main.js": alertsMain,
      "extensions/alerts-today/styles.css": alertsStyles,
    },
  },
];
