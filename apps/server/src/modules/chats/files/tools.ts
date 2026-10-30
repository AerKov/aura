import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { AgentTool } from "../../../providers/types";
import { fail, ok, type ToolContext, type ToolDeps } from "../../helpers/agents/tool-kit";

/** Giving the user a finished file (ADR 0036). */
export function fileTools(deps: ToolDeps, ctx: ToolContext): AgentTool[] {
  return [
    {
      name: "attach_file",
      description:
        "Share a finished file from this project's folder with the user: it appears in the chat as an attachment they can open, print and save to their computer. Use it for deliverables (a report, an export, a PDF), not for code or notes the user does not need as a file. At most 30 MB.",
      inputSchema: {
        path: z
          .string()
          .describe("path of the file inside the project folder, e.g. out/report.pdf"),
        note: z.string().optional().describe("one short sentence to go with it"),
      },
      async handler(input) {
        try {
          const slug = ctx.chat.projectId;
          if (!slug) throw new Error("this chat has no project folder");
          const root = realpathSync(deps.projects.workspaceOf(slug));
          const wanted = resolve(root, String(input.path ?? ""));
          if (!existsSync(wanted)) throw new Error(`no file at ${String(input.path)}`);
          const real = realpathSync(wanted);
          const rel = relative(root, real);
          if (rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes(".git"))
            throw new Error("the file must be inside the project folder");
          if (!statSync(real).isFile()) throw new Error("that is a folder, not a file");
          const ref = deps.files.put(
            { kind: "chat", id: ctx.chat.id },
            basename(real),
            new Uint8Array(readFileSync(real)),
          );
          await deps.chat.post({
            chatId: ctx.chat.id,
            author: { kind: "agent", id: ctx.handle },
            body: String(input.note ?? "").slice(0, 500),
            attachments: [ref],
            topicId: ctx.topicId ?? undefined,
            chainDepth: ctx.depth,
          });
          return ok(`Shared ${ref.name} with the user.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
