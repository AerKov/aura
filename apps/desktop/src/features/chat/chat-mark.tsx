import type { Chat } from "@aura/shared";
import { Mark } from "@/components/mark";
import { useT } from "@/features/localization/i18n";
import { useExtensionApps } from "@/features/shell/apps";
import { extensionIcon } from "@/lib/extension-icons";
import { cn } from "@/lib/utils";
import { agentName } from "./participants";
import { useChatStore } from "./store";

const BOX = { sm: "size-[26px]", md: "size-[34px]", lg: "size-10" } as const;

/**
 * A chat's mark (ADR 0034): the orchestrator for the direct chat, an amber "!" for alerts, the
 * app's icon in a box for an app's chat, and a project's initials otherwise.
 */
export function ChatMark({
  chat,
  size = "lg",
  working = false,
}: {
  chat: Chat;
  size?: "sm" | "md" | "lg";
  working?: boolean;
}) {
  const app = useChatStore((s) =>
    chat.projectId && s.projects[chat.projectId]?.kind === "app" ? chat.projectId : null,
  );
  const ext = useExtensionApps().find((e) => e.id === app);
  const t = useT();
  const profile = useChatStore((s) => s.agents.orchestrator?.name);
  const orchestratorName = agentName("orchestrator", profile, t);
  if (chat.kind === "direct")
    return (
      <Mark
        name="orchestrator"
        label={orchestratorName}
        kind="orchestrator"
        size={size}
        working={working}
      />
    );
  if (chat.kind === "system") return <Mark name="alerts" kind="alert" size={size} />;
  if (app) {
    const Icon = extensionIcon(ext?.icon ?? null);
    return (
      <span className={cn("relative grid shrink-0 place-items-center border", BOX[size])}>
        <Icon className="size-[50%]" strokeWidth={1.5} />
        {working && (
          <span className="bg-signal ring-background absolute -right-1 -bottom-1 size-2.5 animate-pulse rounded-full ring-2" />
        )}
      </span>
    );
  }
  return <Mark name={chat.title} size={size} working={working} />;
}
