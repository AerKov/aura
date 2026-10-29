import { Mark } from "@/components/mark";
import { useT } from "@/features/localization/i18n";
import { agentName } from "./participants";
import { useChatStore } from "./store";

/**
 * An agent's mark with its monogram taken from its name ("H" for the Helper), not from its handle
 * ("O" for the orchestrator), in the interface's language.
 */
export function AgentMark({
  handle,
  size,
  working,
}: {
  handle: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  working?: boolean;
}) {
  const t = useT();
  const name = useChatStore((s) => s.agents[handle]?.name);
  return (
    <Mark
      name={handle}
      label={agentName(handle, name, t)}
      kind={handle === "orchestrator" ? "orchestrator" : "agent"}
      size={size}
      working={working}
    />
  );
}
