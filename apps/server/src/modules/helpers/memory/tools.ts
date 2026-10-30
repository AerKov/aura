import { z } from "zod";
import type { AgentTool } from "../../../providers/types";
import { fail, ok, type ToolContext, type ToolDeps } from "../agents/tool-kit";
import type { MemoryOwner } from "./service";

/** Notes saved per run, so a confused model cannot flood its memory. */
const MAX_NOTES_PER_RUN = 10;

/** Agent memory (ADR 0013): the agent's own notes, and the project's shared notes. */
export function memoryTools(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  const projectId = ctx.chat.projectId;
  const owners: MemoryOwner[] = [{ scope: "agent", owner: ctx.handle }];
  if (projectId) owners.push({ scope: "project", owner: projectId });
  let saved = 0;
  return [
    {
      name: "remember",
      description:
        "Save a short note for later runs: a decision, a user preference, a fact you had to discover. One fact per note, in a full sentence. Never save secrets. Project notes are shared with the project's agents; your own notes go with you to every chat.",
      inputSchema: {
        text: z.string().describe("the note, at most 1000 characters"),
        scope: z
          .enum(["agent", "project"])
          .optional()
          .describe("project (default in project chats) or agent (only for you)"),
      },
      async handler(input) {
        try {
          if (saved >= MAX_NOTES_PER_RUN) throw new Error("enough notes for this run");
          const scope = input.scope === "agent" || !projectId ? "agent" : "project";
          if (input.scope === "project" && !projectId)
            throw new Error("project notes can only be saved in a project chat");
          const { note, duplicate } = await deps.memory.save({
            scope,
            owner: scope === "project" && projectId ? projectId : ctx.handle,
            text: String(input.text ?? ""),
            author: ctx.handle,
            chatId: ctx.chat.id,
          });
          if (duplicate) return ok(`Already remembered (id ${note.id}).`);
          saved++;
          return ok(`Remembered as a ${scope} note (id ${note.id}).`);
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "recall",
      description:
        "Search your notes and the project's notes. Relevant notes are already in your instructions; use this to look for something specific.",
      inputSchema: {
        query: z.string().describe("what you are looking for, in any language"),
        limit: z.number().optional().describe("at most this many notes (default 8)"),
      },
      async handler(input) {
        try {
          const limit = Math.min(Math.max(Number(input.limit) || 8, 1), 20);
          const found = await deps.memory.search(owners, String(input.query ?? ""), limit);
          if (found.length === 0) return ok("Nothing found.");
          return ok(
            found
              .map(
                (n) =>
                  `- ${n.text} (${n.scope} note by @${n.author}, ${n.createdAt.slice(0, 10)}, id ${n.id})`,
              )
              .join("\n"),
          );
        } catch (error) {
          return fail(error);
        }
      },
    },
    {
      name: "forget",
      description: "Delete a note that is wrong or outdated (yours, or this project's).",
      inputSchema: { id: z.string().describe("the note id") },
      async handler(input) {
        try {
          const note = await deps.memory.get(String(input.id ?? ""));
          const allowed =
            note && owners.some((o) => o.scope === note.scope && o.owner === note.owner);
          if (!note || !allowed) throw new Error("no such note among yours or this project's");
          await deps.memory.delete(note.id);
          return ok(`Forgot: ${note.text}`);
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
