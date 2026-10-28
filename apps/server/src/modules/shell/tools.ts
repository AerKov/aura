import { type AppRef, describeLayout, isAppRef, PAGE_IDS } from "@aura/shared";
import { z } from "zod";
import { errorMessage } from "../../lib/log";
import type { AgentTool } from "../../providers/types";
import type { LayoutService } from "./service";

const APPS = `messenger (chats with you and agents), ${PAGE_IDS.map((p) => `page:${p}`).join(", ")}, or ext:<extension id> for an installed app`;

/** The orchestrator arranges the user's screen (harmless and reversible, so no approval). */
export function shellTools(layout: LayoutService): AgentTool[] {
  return [
    {
      name: "show_layout",
      description: "Show which apps are open on the user's screen and how it is split.",
      inputSchema: {},
      async handler() {
        return { text: describeLayout(await layout.get()) };
      },
    },
    {
      name: "set_layout",
      description: `Arrange the user's screen: open an app (in the focused tile, or in a new tile to the right or below) or close one. Apps: ${APPS}. Do it when the user asks to open, show, place or close something.`,
      inputSchema: {
        action: z.enum(["open", "close"]),
        app: z.string().describe("app reference, e.g. page:agents or ext:crm"),
        where: z.enum(["here", "right", "below"]).optional().describe("for open; default here"),
      },
      async handler(input) {
        try {
          const app = String(input.app ?? "");
          if (!isAppRef(app)) throw new Error(`"${app}" is not an app. Apps: ${APPS}`);
          const next =
            input.action === "close"
              ? await layout.close(app as AppRef)
              : await layout.open(
                  app as AppRef,
                  input.where === "right" || input.where === "below" ? input.where : "here",
                );
          return { text: `Done. Screen: ${describeLayout(next)}` };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
  ];
}
