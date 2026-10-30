import { z } from "zod";
import { errorMessage } from "../../../lib/log";
import type { AgentTool } from "../../../providers/types";
import type { CatalogService } from "./service";

const ok = (text: string) => ({ text });
const fail = (error: unknown) => ({ text: `Error: ${errorMessage(error)}`, isError: true });

/** Orchestrator tools for the catalog (ADR 0016): suggest ready-made packs instead of writing them. */
export function catalogTools(
  catalog: CatalogService,
  ctx: { handle: string; chatId: string; topicId?: string | null },
): AgentTool[] {
  return [
    {
      name: "list_catalog",
      description:
        "List the built-in packs: ready-made teams of agents with skills, themes and extensions. Prefer installing a pack over writing the same agents from scratch.",
      inputSchema: {},
      async handler() {
        const packs = catalog.list();
        return ok(
          packs
            .map((p) => {
              const c = p.contents;
              const what = [
                c.agents.length ? `agents ${c.agents.map((a) => `@${a}`).join(", ")}` : "",
                c.skills.length ? `skills ${c.skills.join(", ")}` : "",
                c.themes.length ? `themes ${c.themes.join(", ")}` : "",
                c.extensions.length ? `extensions ${c.extensions.join(", ")}` : "",
              ]
                .filter(Boolean)
                .join("; ");
              return `- ${p.id} (${p.name} ${p.version}${p.installed ? `, installed ${p.installed.version}` : ""}): ${p.description} [${what}]`;
            })
            .join("\n"),
        );
      },
    },
    {
      name: "install_pack",
      description:
        "Ask the user to approve installing a pack: a built-in id from list_catalog, or an https URL of a pack (a GitHub repository or a pack.json) the user gave you. The user sees every file and diff first. Never install a URL the user did not give.",
      inputSchema: {
        id: z.string().optional().describe("built-in pack id"),
        url: z.string().optional().describe("https URL of a pack, from the user"),
        why: z.string().describe("one sentence for the user"),
      },
      async handler(input) {
        try {
          const ref =
            typeof input.url === "string" && input.url
              ? { url: input.url }
              : { id: String(input.id ?? "") };
          const record = await catalog.request(ref, {
            requestedBy: ctx.handle,
            chatId: ctx.chatId,
            topicId: ctx.topicId ?? null,
            why: String(input.why ?? ""),
          });
          return ok(`Approval requested: ${record.title}. It is installed when the user approves.`);
        } catch (error) {
          return fail(error);
        }
      },
    },
  ];
}
