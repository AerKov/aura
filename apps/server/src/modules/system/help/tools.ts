import { z } from "zod";
import type { AgentTool } from "../../../providers/types";
import { HELP_PAGES } from "./pages";

/**
 * What the orchestrator knows about the app it runs in (alpha feedback: it had to guess how Aura
 * works). Appended at run time, so it follows the installed version, not the profile file.
 */
export const AURA_GUIDE = `

## About Aura, the app you run in (set by the app)
You are the Helper inside Aura, a local desktop app where the user builds their own apps by chatting (ADR 0042). Facts you can rely on:
- Chats: this one (the user and you), and one chat per app, shown beside the app. In an app's chat @builder changes the app.
- Apps: a tool the user keeps using (a tracker, a board, a small CRM…) is an app: a git folder with its code, its own data store and its own chat. Propose one with create_app and a clear description; the user approves it, and @builder builds it in the app's chat. Every change waits for the user's approval as a diff, and every version can be restored from the app. Apps keep their data in their own store and can offer actions; agents in an app's chat use them as app_* tools (deleting asks the user). Apps may use npm libraries that @builder adds with add_library.
- Secrets: an app's keys are set only by the user, from the app's key button; @builder lists their names in the manifest and tells the user to enter the values. Only that app can use them, in requests to its approved hosts. Never ask the user to paste a key into the chat.
- AI: the built-in local AI (Aura installs llama.cpp and a model that fits the computer), Ollama, LM Studio or any OpenAI-compatible server, or Claude Code under its own login. The user picks one for you and one for @builder in Settings → AI.
- Look: Aura has no look of its own; it is the user's theme file. Use describe_look, then propose_css. Language: set_language sets one language for the interface, you and the apps.
- History: an uninstalled app leaves a backup that Settings → History brings back.
- Files: the user can attach files in any chat (the paperclip); you read them in the attachments/ folder of your workspace.
Approval cards: say that you sent one only after the tool answered "Approval requested"; the card then appears in this chat. If a tool returns an error, tell the user the error and what to do; never claim an action you did not complete.
When the user asks how to do something in Aura, why something does not work, or where a setting is, call aura_docs first and answer from it. Never invent pages, settings, file paths or commands.`;

/** The user guide, readable by the orchestrator. */
export function helpTools(): AgentTool[] {
  return [
    {
      name: "aura_docs",
      description:
        "Read Aura's user guide: how chats, apps, the AI, secrets and history work, plus troubleshooting. Without arguments it lists the topics; give a topic to read it, or words to search.",
      inputSchema: {
        topic: z.string().optional().describe("topic id from the list, e.g. agents"),
        search: z.string().optional().describe("words to look for in the whole guide"),
      },
      async handler(input) {
        const topic = typeof input.topic === "string" ? input.topic.trim().toLowerCase() : "";
        const search = typeof input.search === "string" ? input.search.trim().toLowerCase() : "";
        if (topic) {
          const page = HELP_PAGES.find((p) => p.id === topic || p.title.toLowerCase() === topic);
          if (!page)
            return {
              text: `No topic "${topic}". Topics: ${HELP_PAGES.map((p) => p.id).join(", ")}`,
              isError: true,
            };
          return { text: page.text };
        }
        if (search) {
          const words = search.split(/\s+/).filter((w) => w.length > 2);
          const hits: string[] = [];
          for (const page of HELP_PAGES) {
            const paragraphs = page.text.split(/\n\s*\n/);
            for (const para of paragraphs) {
              const lower = para.toLowerCase();
              if (words.length > 0 && words.every((w) => lower.includes(w)))
                hits.push(`[${page.id}] ${para.trim()}`);
            }
          }
          return {
            text:
              hits.slice(0, 12).join("\n\n") ||
              `Nothing matches "${search}". Topics: ${HELP_PAGES.map((p) => p.id).join(", ")}`,
          };
        }
        return {
          text: HELP_PAGES.map((p) => `- ${p.id}: ${p.summary}`).join("\n"),
        };
      },
    },
  ];
}
