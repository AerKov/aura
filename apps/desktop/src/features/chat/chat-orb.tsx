import type { Chat } from "@aura/shared";
import { Bell } from "lucide-react";
import { Orb } from "@/components/orb";

/** A chat's orb: the orchestrator for the direct chat, an alert orb for the system chat, a project orb. */
export function ChatOrb({
  chat,
  size = "lg",
  active = false,
}: {
  chat: Chat;
  size?: "sm" | "md" | "lg";
  active?: boolean;
}) {
  if (chat.kind === "direct")
    return <Orb name="orchestrator" kind="orchestrator" size={size} active={active} />;
  if (chat.kind === "system")
    return <Orb name="alerts" kind="alert" icon={Bell} size={size} active={active} />;
  return <Orb name={chat.title} size={size} active={active} />;
}
