import { z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { AppearanceService } from "./appearance";
import type { ExtensionService } from "./extensions";
import type { McpService } from "./mcp";

export interface CustomizeDeps {
  appearance: AppearanceService;
  mcp: McpService;
  extensions: ExtensionService;
}

const ok = (text: string) => ({ text });
const fail = (error: unknown) => ({ text: `Error: ${errorMessage(error)}`, isError: true });

/** Orchestrator tools to change the app itself by chat (docs/SPEC.md section 3, "Customization"). */
export function customizeTools(
  deps: CustomizeDeps,
  ctx: { handle: string; chatId: string },
): AgentTool[] {
  const by = (why: unknown) => ({
    requestedBy: ctx.handle,
    chatId: ctx.chatId,
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
            "Theme CSS overrides these variables on :root and .dark: --background, --foreground, --card, --card-foreground, --primary, --primary-foreground, --secondary, --muted, --muted-foreground, --accent, --border, --input, --ring, --radius, --sidebar, --rail, --rail-foreground, --chat-bg, --bubble-own, --bubble-other, --aura-1, --aura-2 (the accent gradient).",
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
        "Switch the theme or the enabled snippets among existing ones (no approval needed). theme null = default.",
      inputSchema: {
        theme: z.string().nullable().optional(),
        snippets: z.array(z.string()).optional(),
      },
      async handler(input) {
        try {
          const a = await deps.appearance.set({
            theme: input.theme === undefined ? undefined : (input.theme as string | null),
            snippets: Array.isArray(input.snippets) ? input.snippets.map(String) : undefined,
          });
          return ok(
            `Theme: ${a.theme ?? "default"}; snippets: ${a.snippets.join(", ") || "none"}.`,
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
      description: [
        "Propose a UI extension (a panel). It runs in a sandboxed frame without network access.",
        "main.js must `export default function activate(ctx)`. ctx API: ctx.ui.registerPanel({ title, render(el) }),",
        "await ctx.chat.list(), await ctx.chat.messages(chatId) (chat.read), await ctx.chat.post(chatId, markdown) (chat.write),",
        "await ctx.alerts.recent() (alerts.read: alert cards {source, severity, title, summary, count, lastAt}),",
        "ctx.events.on('message.created', (message) => …) (chat.read). Use plain DOM; keep it small; style with styles.css.",
        "Messages: {id, chatId, author: {kind, id}, body (markdown), card, createdAt}. Chats: {id, kind, title}.",
        "The app's theme is available as CSS variables (var(--background), var(--foreground), var(--card), var(--muted-foreground), var(--border), var(--primary), var(--radius)); use them so the panel matches light and dark themes.",
      ].join(" "),
      inputSchema: {
        id: z.string().describe("lowercase-with-dashes"),
        name: z.string(),
        version: z.string().describe("x.y.z"),
        permissions: z.array(z.enum(["chat.read", "chat.write", "ui.panel", "alerts.read"])),
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
                minAppVersion: "0.6.0",
                permissions: input.permissions,
                author: ctx.handle,
              },
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
