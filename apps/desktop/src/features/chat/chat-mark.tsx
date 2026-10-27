import type { Chat } from "@aura/shared";
import { Bell, FolderGit2 } from "lucide-react";
import { Mark } from "@/components/mark";

/** A chat's mark: the orchestrator for the direct chat, alerts for the system chat, a project mark. */
export function ChatMark({
  chat,
  size = "lg",
  working = false,
}: {
  chat: Chat;
  size?: "sm" | "md" | "lg";
  working?: boolean;
}) {
  if (chat.kind === "direct")
    return <Mark name="orchestrator" kind="orchestrator" size={size} working={working} />;
  if (chat.kind === "system")
    return <Mark name="alerts" kind="alert" icon={Bell} size={size} working={working} />;
  return <Mark name={chat.title} icon={FolderGit2} size={size} working={working} />;
}
