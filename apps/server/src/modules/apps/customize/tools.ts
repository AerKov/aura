import { LOOK_PARTS, LOOK_TOKENS } from "@aura/shared";
import { z } from "zod";
import { errorMessage } from "../../../lib/log";
import type { AgentTool } from "../../../providers/types";
import type { AppearanceService } from "./appearance";
import type { ExtensionService } from "./extensions";

export interface CustomizeDeps {
  appearance: AppearanceService;
  extensions: ExtensionService;
}

const ok = (text: string) => ({ text });
const fail = (error: unknown) => ({ text: `Error: ${errorMessage(error)}`, isError: true });

/** How to write an extension: the tool description is all the orchestrator sees of the API. */
export const EXTENSION_GUIDE = [
  "An app opens on the user's screen with its chat beside it. It runs in a sandboxed frame with no direct network.",
  "main.js must `export default function activate(ctx)`; use plain DOM, keep it small, style with styles.css.",
  "ctx API (each part needs its permission): ctx.ui.registerPanel({ title, render(el) }) (ui.panel);",
  "ctx.ui.form(el, { title, fields: [{ name, label, type: text|textarea|number|date|checkbox|select|email|url, options, placeholder, required, value }], submitLabel, onSubmit: async (values) => … }) and ctx.ui.button(el, label, async () => …) build themed controls;",
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
  "ctx.events.on('message.created', (message) => …) (chat.read).",
  "Messages: {id, chatId, author: {kind, id}, body (markdown), card, createdAt}. Chats: {id, kind, title}.",
  "Theme CSS variables: var(--background), var(--foreground), var(--card), var(--muted), var(--muted-foreground), var(--border), var(--primary), var(--primary-foreground), var(--radius); forms and buttons already use them.",
  'Apps are not limited to the kit: for a chart, a calendar, a map renderer or markdown, add a library with add_library (an exact npm version; UMD .js builds define a global, .mjs ones load with await ctx.lib("lib/…"), .css is applied) and list its path in manifest.json "libraries"; the frame has no network, so never load scripts from a URL.',
  'ctx.language is the language the user chose for Aura ("en", "uk"…): write the app\'s own texts in it.',
  'In manifest.json keep "description" (one line on what it is for, shown in the app list) up to date and pick an "icon". Ask only for the permissions it uses.',
].join(" ");

/** The Helper's tools to change how Aura looks, by chat (ADR 0041). */
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
      name: "describe_look",
      description:
        "How Aura looks and how to change it (ADR 0041): Aura has no look of its own, everything comes from the active theme, a CSS file of the user's. Lists each part of the screen (the sidebar, the chat, bubbles…) with its variables, the base colours and fonts, and the active theme's CSS. Read it before propose_css.",
      inputSchema: {},
      async handler() {
        const a = await deps.appearance.get();
        const css = a.theme ? deps.appearance.source("theme", a.theme) : null;
        return ok(
          [
            `Active theme: ${a.theme ?? "none"} (themes: ${a.themes.join(", ") || "none"}); snippets on: ${a.snippets.join(", ") || "none"}.`,
            'Change a part by setting its variables in the active theme (on :root for light and .dark for dark mode), with propose_css target theme and the same name, sending the whole file. Each part is also marked data-part="<name>" for a change no variable covers. The language is set_language, without approval.',
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
      description: "Show themes, CSS snippets and apps, and what is active.",
      inputSchema: {},
      async handler() {
        const a = await deps.appearance.get();
        const ext = await deps.extensions.list();
        return ok(
          [
            `Theme: ${a.theme ?? "default"} (available: ${a.themes.join(", ") || "none"})`,
            `Snippets on: ${a.snippets.join(", ") || "none"} (available: ${a.availableSnippets.join(", ") || "none"})`,
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
  ];
}
