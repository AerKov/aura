import {
  BAR_EDGES,
  type BarEdge,
  EXTENSION_ICONS,
  type ExtensionPermission,
  LOOK_PARTS,
  LOOK_TOKENS,
  type WindowStyle,
  WM_PRESETS,
} from "@aura/shared";
import { z } from "zod";
import { errorMessage } from "../../../lib/log";
import type { AgentTool } from "../../../providers/types";
import type { AppearanceService } from "./appearance";
import { type ExtensionService, PERMISSIONS } from "./extensions";
import type { McpService } from "./mcp";

export interface CustomizeDeps {
  appearance: AppearanceService;
  mcp: McpService;
  extensions: ExtensionService;
}

const ok = (text: string) => ({ text });
const fail = (error: unknown) => ({ text: `Error: ${errorMessage(error)}`, isError: true });

/** Permissions older apps (before 0.18) understand. */
const V1_PERMISSIONS = { "chat.read": 1, "chat.write": 1, "ui.panel": 1, "alerts.read": 1 };

/** How to write an extension: the tool description is all the orchestrator sees of the API. */
export const EXTENSION_GUIDE = [
  "Propose a UI extension: a small app that opens as a tile on the user's screen, next to the open chat. It runs in a sandboxed frame with no direct network.",
  "main.js must `export default function activate(ctx)`; use plain DOM, keep it small, style with styles.css.",
  "ctx API (each part needs its permission): ctx.ui.registerPanel({ title, render(el) }) (ui.panel);",
  "ctx.ui.form(el, { title, fields: [{ name, label, type: text|textarea|number|date|checkbox|select|email|url, options, placeholder, required, value }], submitLabel, onSubmit: async (values) => … }) and ctx.ui.button(el, label, async () => …) build themed controls;",
  "await ctx.context() → { chatId, projectId } of the chat open in Chats (it changes: listen with ctx.events.on('context', …));",
  "await ctx.chat.list(), await ctx.chat.messages(chatId) (chat.read), await ctx.chat.post(chatId, markdown) (chat.write; does not wake agents);",
  "await ctx.agents.ask(agent, text, { chatId }) (agents.ask): posts a message from the user `@agent text` in the current chat (or chatId), which wakes the agent under normal budgets; use it for buttons and forms that ask an agent to do something;",
  "await ctx.storage.get(key), ctx.storage.set(key, jsonValue), ctx.storage.delete(key), ctx.storage.keys() (storage): the extension's own data, never in chat messages;",
  "await ctx.net.fetch(url, { method, headers, body }) → { status, ok, contentType, body (text), truncated } (net): only hosts listed in `hosts`; write a stored secret as the text $" +
    "{secret:NAME} in a header or the URL and list NAME in `secrets`: Aura fills it in on the server, the extension never sees the value;",
  'Apps built in Aura (with a chat) also have collections (storage): declare them in manifest.json as "collections": { clients: { fields: { name: "string", email: "string?", since: "date" } } } (types string, number, boolean, date, json; ? = optional) and use await ctx.data.list(collection, { where, search, sort: "-since", limit }), ctx.data.get(collection, id), ctx.data.insert(collection, record) → record with id, ctx.data.update(collection, id, patch), ctx.data.delete(collection, id), ctx.data.count(collection, query), ctx.data.on(collection, () => refresh()) for live changes (also made by agents);',
  'declare actions in manifest.json as "actions": { add_client: { kind: "insert", collection: "clients", description: "…" } } (kinds list, get, count, insert, update, delete): agents in the app\'s chat use them to work with the app, and ctx.actions.run(name, input) runs one; list in "provides" the actions other apps may call; to call another app\'s action add "apps.call" to permissions and "uses": ["crm.list_clients"], then await ctx.apps.call("crm", "list_clients", input);',
  "Prefer the app kit (themed, live, built on collections) over hand-made DOM: ctx.kit.tabs(el, [{ label, render(tab) }]); ctx.kit.form(el, { collection, title, fields: [names], options: { field: [values] }, defaults, multiline: [names], id (to edit), onSaved }); ctx.kit.table(el, { collection, columns: [{ field, label }], sort, query, options }) with search, sorting, edit and delete; ctx.kit.board(el, { collection, groupBy, groups: [values], labels, title, subtitle }) with drag and drop between columns; ctx.kit.cards(el, { collection, title, body, tag, sort }); ctx.kit.chart(el, { collection, groupBy, value (a number field to sum), title }); ctx.kit.stat(el, { collection, label, query, sum }); ctx.kit.row(el) puts blocks side by side;",
  "await ctx.files.list(path), await ctx.files.read(path) (files.read): read-only files of the current project (or { project } as the last argument);",
  "Files (docs): the app's own files, kept outside git, at most 30 MB each: await ctx.docs.pick({ accept: 'application/pdf,.csv', multiple: true }) opens Aura's own window where the user adds files from their computer and returns [{ id, name, size, type }] (an empty list if they cancel); await ctx.docs.list(); await ctx.docs.put(name, data) stores text, bytes (Uint8Array/ArrayBuffer) or { base64 } the app made (an invoice PDF made with a library from add_library, a CSV export) and returns the record; await ctx.docs.read(id, { as: 'text' | 'base64' }) (up to 10 MB); await ctx.docs.remove(id); ctx.docs.view(id) shows a PDF, image or text in a window with Print and Save buttons (also ctx.docs.view({ name, type, data }) for content the app has but does not keep); ctx.docs.save(id) hands the file to the user's computer. Never use window.print, <a download>, an <iframe> or an <embed> for this: the frame cannot do those, ctx.docs can.",
  "await ctx.alerts.recent() (alerts.read: alert cards {source, severity, title, summary, count, lastAt}); await ctx.alerts.post({ severity: 'info'|'warning'|'critical', title, summary, fingerprint? }) (alerts.write: an alert card in the Alerts chat from app:<id>; the same title or fingerprint within an hour bumps its count; warnings wake the orchestrator; at most 30 an hour); ctx.events.on('message.created', (message) => …) (chat.read).",
  "Messages: {id, chatId, author: {kind, id}, body (markdown), card, createdAt}. Chats: {id, kind, title}.",
  "Theme CSS variables: var(--background), var(--foreground), var(--card), var(--muted), var(--muted-foreground), var(--border), var(--primary), var(--primary-foreground), var(--radius); forms and buttons already use them.",
  'Apps are not limited to the kit: for a chart, a calendar, a map renderer or markdown, add a library with add_library (an exact npm version; UMD .js builds define a global, .mjs ones load with await ctx.lib("lib/…"), .css is applied) and list its path in manifest.json "libraries"; the frame has no network, so never load scripts from a URL.',
  'ctx.language is the language the user chose for Aura ("en", "uk"…): write the app\'s own texts in it.',
  'In manifest.json keep "description" (one line on what it is for, shown in the launcher) and "group" (its launcher group, e.g. "Work", "Home", "Money"; short) up to date.',
  "Pass `project` to make it a project's app: it then opens by itself next to that project's chat. Pick an `icon`. Ask only for the permissions it uses.",
].join(" ");

/** Orchestrator tools to change the app itself by chat (docs/SPEC.md section 3, "Customization"). */
function isBarEdge(value: unknown): value is BarEdge {
  return typeof value === "string" && (BAR_EDGES as readonly string[]).includes(value);
}

/** The tool's window-style fields as a change: a preset first, then single values over it. */
function windowInput(input: Record<string, unknown>): Partial<WindowStyle> | undefined {
  const preset =
    input.preset === "airy" || input.preset === "compact" ? WM_PRESETS[input.preset] : undefined;
  const change: Partial<WindowStyle> = { ...preset };
  for (const key of ["gaps", "radius", "border"] as const)
    if (typeof input[key] === "number") change[key] = input[key];
  if (input.titles === "full" || input.titles === "minimal" || input.titles === "none")
    change.titles = input.titles;
  if (input.mod === "alt" || input.mod === "ctrl-alt" || input.mod === "meta")
    change.mod = input.mod;
  return Object.keys(change).length > 0 ? change : undefined;
}

export function customizeTools(
  deps: CustomizeDeps,
  ctx: { handle: string; chatId: string; topicId?: string | null },
): AgentTool[] {
  const by = (why: unknown) => ({
    requestedBy: ctx.handle,
    chatId: ctx.chatId,
    topicId: ctx.topicId ?? null,
    why: String(why ?? ""),
  });
  return [
    {
      name: "describe_look",
      description:
        "How Aura looks and how to change it (ADR 0041): Aura has no look of its own, everything comes from the active theme, a CSS file of the user's. Lists each part of the screen (the bar, windows, the chat list, bubbles…) with its variables, the base colours and fonts, and the active theme's CSS. Read it before propose_css.",
      inputSchema: {},
      async handler() {
        const a = await deps.appearance.get();
        const css = a.theme ? deps.appearance.source("theme", a.theme) : null;
        return ok(
          [
            `Active theme: ${a.theme ?? "none"} (themes: ${a.themes.join(", ") || "none"}); snippets on: ${a.snippets.join(", ") || "none"}.`,
            'Change a part by setting its variables in the active theme (on :root for light and .dark for dark mode), with propose_css target theme and the same name, sending the whole file. Each part is also marked data-part="<name>" for a change no variable covers. The window style (gaps, corners, borders, titles), the bar\'s items and edge and the language are set_appearance and set_language, without approval.',
            "If the user has a bar app of their own (bar_mode app), the bar is that app: change it in its chat (change_bar), not with a theme.",
            "",
            "Parts:",
            ...LOOK_PARTS.map(
              (p) =>
                `- ${p.part}: ${p.label}. ${Object.entries(p.vars)
                  .map(([v, what]) => `${v} (${what})`)
                  .join(", ")}`,
            ),
            "",
            `Base: ${Object.entries(LOOK_TOKENS)
              .map(([v, what]) => `${v} (${what})`)
              .join(", ")}.`,
            "",
            css ? `The active theme's CSS:\n\n${css}` : "No theme is active.",
          ].join("\n"),
        );
      },
    },
    {
      name: "list_customizations",
      description: "Show themes, CSS snippets, MCP servers and UI extensions, and what is active.",
      inputSchema: {},
      async handler() {
        const a = await deps.appearance.get();
        const ext = await deps.extensions.list();
        return ok(
          [
            `Theme: ${a.theme ?? "default"} (available: ${a.themes.join(", ") || "none"})`,
            `Snippets on: ${a.snippets.join(", ") || "none"} (available: ${a.availableSnippets.join(", ") || "none"})`,
            `MCP servers: ${
              deps.mcp
                .list()
                .map((s) => `${s.name} → ${s.agents.join(", ")}`)
                .join("; ") || "none"
            }`,
            `Extensions: ${ext.map((e) => `${e.id} (${e.enabled ? "on" : "off"}${e.problem ? `, ${e.problem}` : ""})`).join(", ") || "none"}`,
            "",
            "To change how Aura looks, see describe_look.",
          ].join("\n"),
        );
      },
    },
    {
      name: "propose_css",
      description:
        "Propose a theme (themes/<name>/theme.css) or a CSS snippet (snippets/<name>.css). The user can try it on the approval card before approving. Read describe_look first; to change the look, change the active theme (same name, the whole file) and prefer its variables over styling elements.",
      inputSchema: {
        target: z.enum(["theme", "snippet"]),
        name: z.string().describe("lowercase-with-dashes"),
        css: z.string(),
        activate: z.boolean().describe("apply it right after approval"),
        why: z.string(),
      },
      async handler(input) {
        try {
          await deps.appearance.propose(
            {
              target: input.target === "snippet" ? "snippet" : "theme",
              name: String(input.name ?? ""),
              css: String(input.css ?? ""),
              activate: input.activate === true,
            },
            by(input.why),
          );
          return ok("Approval requested; the user can try it on first.");
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "set_appearance",
      description:
        "Switch the theme or the enabled snippets among existing ones, arrange the bar (its items and the screen edge it sits on), or set how tiles look (no approval needed). theme null = default. Rail keys: chats, signals, settings, ext:<extension id>; chats and settings cannot be hidden. Window styles: preset airy (gaps 10, radius 10, border 2, minimal titles) or compact (no gaps, square, border 1, full titles), then gaps/radius 0-24 px, border 0-4 px, titles full|minimal|none, mod (the shortcuts' modifier) alt|ctrl-alt|meta.",
      inputSchema: {
        theme: z.string().nullable().optional(),
        snippets: z.array(z.string()).optional(),
        rail_order: z.array(z.string()).optional().describe("rail keys, top first"),
        rail_hidden: z.array(z.string()).optional().describe("rail keys to hide"),
        bar_edge: z.enum(["left", "right", "top", "bottom"]).optional(),
        bar_size: z
          .number()
          .int()
          .min(24)
          .max(96)
          .nullable()
          .optional()
          .describe("the bar's thickness in px; null for the default (56 on the sides, 48 on top)"),
        bar_mode: z
          .enum(["builtin", "app", "off"])
          .optional()
          .describe("Aura's built-in bar, the user's bar app (change it with change_bar), or none"),
        preset: z.enum(["airy", "compact"]).optional().describe("applied before the values below"),
        gaps: z.number().int().min(0).max(24).optional(),
        radius: z.number().int().min(0).max(24).optional(),
        border: z.number().int().min(0).max(4).optional(),
        titles: z.enum(["full", "minimal", "none"]).optional(),
        mod: z.enum(["alt", "ctrl-alt", "meta"]).optional(),
      },
      async handler(input) {
        try {
          const a = await deps.appearance.set({
            theme: input.theme === undefined ? undefined : (input.theme as string | null),
            snippets: Array.isArray(input.snippets) ? input.snippets.map(String) : undefined,
            wm: windowInput(input),
            rail:
              Array.isArray(input.rail_order) ||
              Array.isArray(input.rail_hidden) ||
              typeof input.bar_edge === "string" ||
              typeof input.bar_mode === "string" ||
              input.bar_size !== undefined
                ? {
                    size:
                      input.bar_size === null
                        ? null
                        : typeof input.bar_size === "number"
                          ? input.bar_size
                          : undefined,
                    mode:
                      input.bar_mode === "builtin" ||
                      input.bar_mode === "app" ||
                      input.bar_mode === "off"
                        ? input.bar_mode
                        : undefined,
                    edge: isBarEdge(input.bar_edge) ? input.bar_edge : undefined,
                    order: Array.isArray(input.rail_order)
                      ? input.rail_order.map(String)
                      : undefined,
                    hidden: Array.isArray(input.rail_hidden)
                      ? input.rail_hidden.map(String)
                      : undefined,
                  }
                : undefined,
          });
          return ok(
            `Theme: ${a.theme ?? "default"}; snippets: ${a.snippets.join(", ") || "none"}; rail order: ${a.rail.order.join(", ") || "default"}; hidden: ${a.rail.hidden.join(", ") || "none"}; bar: ${a.rail.mode} on the ${a.rail.edge}${a.rail.size ? `, ${a.rail.size}px` : ""}; tiles: gaps ${a.wm.gaps}, radius ${a.wm.radius}, border ${a.wm.border}, titles ${a.wm.titles}; mod: ${a.wm.mod}.`,
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "propose_mcp_server",
      description:
        "Propose an MCP server for specific agents (saved in mcp/servers.json). A command runs on the user's computer, so explain why. Secrets go in env as references (a dollar sign, then {env:NAME}), never literal values.",
      inputSchema: {
        name: z.string(),
        command: z.string().optional(),
        args: z.array(z.string()).optional(),
        env: z.record(z.string(), z.string()).optional(),
        url: z.string().optional().describe("for remote (http) servers instead of a command"),
        agents: z.array(z.string()).describe("handles allowed to use it"),
        why: z.string(),
      },
      async handler(input) {
        try {
          const { name, why, ...config } = input;
          await deps.mcp.propose({ name: String(name ?? ""), config }, by(why));
          return ok("Approval requested for the MCP server.");
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "propose_extension",
      description: EXTENSION_GUIDE,
      inputSchema: {
        id: z.string().describe("lowercase-with-dashes"),
        name: z.string(),
        version: z.string().describe("x.y.z"),
        permissions: z.array(z.enum(Object.keys(PERMISSIONS) as [ExtensionPermission])),
        icon: z.enum(EXTENSION_ICONS).optional(),
        hosts: z
          .array(z.string())
          .optional()
          .describe("hosts the extension may reach with net (api.example.com, *.example.com)"),
        secrets: z
          .array(z.string())
          .optional()
          .describe("stored secret names Aura may put into those requests"),
        project: z
          .string()
          .optional()
          .describe("project slug: the extension becomes that project's app"),
        main_js: z.string(),
        styles_css: z.string().optional(),
        why: z.string(),
      },
      async handler(input) {
        try {
          await deps.extensions.propose(
            {
              manifest: {
                id: input.id,
                name: input.name,
                version: input.version,
                minAppVersion:
                  Array.isArray(input.permissions) &&
                  input.permissions.some((p) => !(p in V1_PERMISSIONS))
                    ? "0.18.0"
                    : "0.6.0",
                permissions: input.permissions,
                author: ctx.handle,
                ...(input.icon ? { icon: input.icon } : {}),
                ...(Array.isArray(input.hosts) && input.hosts.length ? { hosts: input.hosts } : {}),
                ...(Array.isArray(input.secrets) && input.secrets.length
                  ? { secrets: input.secrets }
                  : {}),
              },
              project: typeof input.project === "string" ? input.project : undefined,
              mainJs: String(input.main_js ?? ""),
              stylesCss: typeof input.styles_css === "string" ? input.styles_css : "",
            },
            by(input.why),
          );
          return ok("Approval requested for the extension.");
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
