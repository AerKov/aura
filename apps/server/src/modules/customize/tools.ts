import { EXTENSION_ICONS, type ExtensionPermission } from "@aura/shared";
import { z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
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
  "await ctx.files.list(path), await ctx.files.read(path) (files.read): read-only files of the current project (or { project } as the last argument);",
  "await ctx.alerts.recent() (alerts.read: alert cards {source, severity, title, summary, count, lastAt}); ctx.events.on('message.created', (message) => …) (chat.read).",
  "Messages: {id, chatId, author: {kind, id}, body (markdown), card, createdAt}. Chats: {id, kind, title}.",
  "Theme CSS variables: var(--background), var(--foreground), var(--card), var(--muted), var(--muted-foreground), var(--border), var(--primary), var(--primary-foreground), var(--radius); forms and buttons already use them.",
  "Pass `project` to make it a project's app: it then opens by itself next to that project's chat. Pick an `icon`. Ask only for the permissions it uses.",
].join(" ");

/** Orchestrator tools to change the app itself by chat (docs/SPEC.md section 3, "Customization"). */
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
            "Theme CSS overrides these variables on :root and .dark: --background, --foreground, --card, --card-foreground, --primary, --primary-foreground, --secondary, --muted, --muted-foreground, --accent, --border, --input, --ring, --radius, --sidebar, --rail, --rail-foreground, --chat-bg, --grid-dot, --bubble-own, --bubble-other, --signal (the one accent colour).",
          ].join("\n"),
        );
      },
    },
    {
      name: "propose_css",
      description:
        "Propose a theme (themes/<name>/theme.css) or a CSS snippet (snippets/<name>.css). The user can try it on the approval card before approving. Prefer overriding CSS variables over styling elements.",
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
        "Switch the theme or the enabled snippets among existing ones, or arrange the navigation rail (no approval needed). theme null = default. Rail keys: chats, skills, memory, agents, integrations, catalog, jobs, engines, customize, devices, ext:<extension id>; chats and customize cannot be hidden.",
      inputSchema: {
        theme: z.string().nullable().optional(),
        snippets: z.array(z.string()).optional(),
        rail_order: z.array(z.string()).optional().describe("rail keys, top first"),
        rail_hidden: z.array(z.string()).optional().describe("rail keys to hide"),
      },
      async handler(input) {
        try {
          const a = await deps.appearance.set({
            theme: input.theme === undefined ? undefined : (input.theme as string | null),
            snippets: Array.isArray(input.snippets) ? input.snippets.map(String) : undefined,
            rail:
              Array.isArray(input.rail_order) || Array.isArray(input.rail_hidden)
                ? {
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
            `Theme: ${a.theme ?? "default"}; snippets: ${a.snippets.join(", ") || "none"}; rail order: ${a.rail.order.join(", ") || "default"}; hidden: ${a.rail.hidden.join(", ") || "none"}.`,
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
