import { z } from "zod";
import { errorMessage } from "../../../lib/log";
import type { AgentTool } from "../../../providers/types";
import type { LocalizationService } from "./service";

/** The orchestrator sets Aura's language when the user asks (a setting, like the theme). */
export function localizationTools(localization: LocalizationService): AgentTool[] {
  return [
    {
      name: "set_language",
      description:
        "Set the language of Aura's interface, of agents' answers and of apps (they get it as ctx.language). \"auto\" follows the computer's language for the interface and the user's own messages for agents. Use it only when the user asks.",
      inputSchema: {
        language: z.string().describe('a language code such as "uk" or "en", or "auto"'),
      },
      async handler(input) {
        try {
          const state = await localization.set(String(input.language ?? ""));
          const name = state.available.find((l) => l.code === state.choice)?.name ?? "automatic";
          return { text: `The language is now ${name}.` };
        } catch (error) {
          return { text: `Error: ${errorMessage(error)}`, isError: true };
        }
      },
    },
  ];
}
