import { REPLACEABLE_APPS } from "@aura/shared";
import { z } from "zod";
import { errorMessage } from "../../../lib/log";
import type { AgentTool } from "../../../providers/types";
import type { ChatService } from "../../chats/chat/service";
import { PLAIN_CHANGES, plainChanges } from "../../system/approvals/plain";
import type { ApprovalService } from "../../system/approvals/service";
import type { AppearanceService } from "../customize/appearance";
import { addLibrary } from "./libraries";
import { type AppService, BUILDER_HANDLE } from "./service";
import { type AppSnapshots, describeSnapshot } from "./snapshots";

/** The orchestrator turns an idea into an app (with the user's approval). */
export function appTools(
  approvals: ApprovalService,
  ctx: { handle: string; chatId: string; topicId?: string | null },
): AgentTool[] {
  return [
    {
      name: "create_app",
      description: `Ask the user to approve a new app: a tool they run on their screen (a CRM, a board, a tracker…) with its own chat, where @${BUILDER_HANDLE} builds it from your description and later changes it on request; every change is shown to the user as a diff first. Prefer this over propose_extension when the user wants something they will keep using and changing.`,
      inputSchema: {
        ...PLAIN_CHANGES,
        name: z.string().describe("short name, e.g. Clients"),
        id: z.string().optional().describe("lowercase-with-dashes; derived from the name"),
        description: z
          .string()
          .describe("what the app should do, its data and views, for the builder"),
        replaces: z
          .enum(REPLACEABLE_APPS)
          .optional()
          .describe(
            "set when the user wants their own version of a built-in app (chats, signals = Alerts, settings): the new app opens wherever that one would; the built-in one comes back if the app is turned off or removed. Aura's own code stays as it is (read-only): the user's version is this app, which they can change like any other",
          ),
        why: z.string(),
      },
      async handler(input) {
        try {
          const name = String(input.name ?? "").trim();
          if (!name) throw new Error("name is required");
          await approvals.request({
            kind: "app_create",
            requestedBy: ctx.handle,
            chatId: ctx.chatId,
            topicId: ctx.topicId ?? null,
            title: `Create the app "${name}"`,
            why: String(input.why ?? ""),
            changes: plainChanges(input),
            preview: [
              `It gets its own chat, where @${BUILDER_HANDLE} builds it; each change waits for your approval.`,
              ...(input.replaces
                ? [
                    "",
                    `It takes the place of the built-in **${String(input.replaces)}** app. Turn it off or remove it to have the built-in one back.`,
                  ]
                : []),
              "",
              "**What it should do**",
              "",
              String(input.description ?? "")
                .split("\n")
                .map((l) => `> ${l}`)
                .join("\n"),
            ].join("\n"),
            payload: {
              name,
              id: typeof input.id === "string" ? input.id : undefined,
              description: String(input.description ?? ""),
              ...(typeof input.replaces === "string" ? { replaces: input.replaces } : {}),
            },
          });
          return { text: "Approval requested. The app is created when the user approves." };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
  ];
}

/**
 * The orchestrator passes a change of Aura's bar to @builder in the bar's chat (ADR 0029). The
 * bar app is created (looking like the built-in bar) and shown the first time; the change itself
 * waits for the user's approval as a diff, like any app's.
 */
export function barTools(
  deps: { apps: AppService; appearance: AppearanceService; chat: ChatService },
  ctx: { handle: string; depth: number },
): AgentTool[] {
  return [
    {
      name: "change_bar",
      description: `Change Aura's bar (the strip with the apps and the status on the edge of the screen) beyond what set_appearance offers: new widgets, another look, other behaviour. Its code is an app; this hands the request to @${BUILDER_HANDLE} in the bar's chat, and the user approves the change as a diff (versions can be restored). Use set_appearance for the bar's edge, its icons' order or turning it off.`,
      inputSchema: {
        request: z.string().describe("what to change, in the user's words plus what you know"),
      },
      async handler(input) {
        try {
          const request = String(input.request ?? "").trim();
          if (!request || request.length > 4000)
            throw new Error("request is required (max 4000 chars)");
          const bar = await deps.apps.ensureBar();
          const { rail } = await deps.appearance.get();
          if (rail.mode !== "app") await deps.appearance.set({ rail: { mode: "app" } });
          await deps.chat.post({
            chatId: bar.chatId,
            author: { kind: "agent", id: ctx.handle },
            body: `@${BUILDER_HANDLE} ${request}`,
            chainDepth: ctx.depth,
          });
          return {
            text: `${bar.created ? "Created the bar app and switched to it. " : ""}Asked @${BUILDER_HANDLE} in the bar's chat; the user approves the change there as a diff.`,
          };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
  ];
}

/** Agents in an app's chat look at the app as the user sees it (WISH-2). */
export function snapshotTool(snapshots: AppSnapshots, app: string): AgentTool {
  return {
    name: "app_snapshot",
    description:
      "See this app as the user sees it right now: its size, an outline of its page (headings, buttons, fields, tables, text) and its recent errors. Use it after a change to check the result. It works while the app is open on the user's screen; your change shows only while they preview its draft.",
    inputSchema: {},
    async handler() {
      return { text: describeSnapshot(app, await snapshots.request(app)) };
    },
  };
}

/** @builder adds a library from npm to the app it changes (ADR 0033). */
export function libraryTool(appDir: string, fetchFn?: typeof fetch): AgentTool {
  return {
    name: "add_library",
    description:
      'Add a library file from npm to this app\'s folder (lib/…), fetched once by Aura from the jsDelivr CDN at an exact version. Use a UMD/IIFE build (.js, it defines a global such as Chart), a self-contained ES module (.mjs, load it with await ctx.lib("lib/…")) or a stylesheet (.css). Then list the returned path in manifest.json "libraries" (in load order). The user sees it on the change card. Prefer small builds; no file over 2 MB.',
    inputSchema: {
      package: z.string().describe("npm package, e.g. chart.js or @scope/name"),
      version: z.string().describe("exact version, e.g. 4.4.1"),
      file: z.string().describe("path inside the package, e.g. dist/chart.umd.js"),
    },
    async handler(input) {
      try {
        const added = await addLibrary(
          appDir,
          {
            package: String(input.package ?? ""),
            version: String(input.version ?? ""),
            file: String(input.file ?? ""),
          },
          fetchFn,
        );
        return {
          text: `Added ${added.path} (${Math.ceil(added.bytes / 1000)} KB, sha256 ${added.sha256.slice(0, 16)}…). Add "${added.path}" to "libraries" in manifest.json.`,
        };
      } catch (error) {
        return { text: `Error: ${errorMessage(error)}`, isError: true };
      }
    },
  };
}
