import type { ChatKind } from "@crew/shared";
import { Bell, Bot, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { colorFor, initials } from "./participants";

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        size === "sm" ? "size-8 text-xs" : "size-11 text-sm",
        colorFor(name),
      )}
    >
      {initials(name)}
    </div>
  );
}

export function ChatAvatar({ kind, title }: { kind: ChatKind; title: string }) {
  const Icon = kind === "direct" ? Bot : kind === "system" ? Bell : Users;
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center rounded-full text-white",
        kind === "system" ? "bg-rose-500" : colorFor(title),
      )}
    >
      <Icon className="size-5" />
    </div>
  );
}
