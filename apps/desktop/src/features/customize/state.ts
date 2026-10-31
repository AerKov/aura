import type { CustomizeState } from "@aura/shared";
import { setState } from "@/features/chat/store";
import { api, call } from "@/lib/api";

/** What the shell knows about the user's apps, safe mode and language (refreshed on changes). */
export async function loadCustomize(): Promise<CustomizeState> {
  const state = await call(() => api.customize.get());
  setState(() => ({ customize: state }));
  return state;
}
