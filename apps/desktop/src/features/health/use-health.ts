import type { HealthReport } from "@crew/shared";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";

export type HealthState =
  | { kind: "loading" }
  | { kind: "ok"; report: HealthReport; checkedAt: Date }
  | { kind: "unreachable"; error: string; checkedAt: Date };

const POLL_MS = 5_000;

/** Polls `GET /health` on the local server. */
export function useHealth() {
  const [state, setState] = useState<HealthState>({ kind: "loading" });

  const refresh = useCallback(async () => {
    try {
      const { data, error } = await api.health.get();
      if (error) {
        setState({ kind: "unreachable", error: `HTTP ${error.status}`, checkedAt: new Date() });
        return;
      }
      setState({ kind: "ok", report: data, checkedAt: new Date() });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error("health check failed", { error: message });
      setState({ kind: "unreachable", error: message, checkedAt: new Date() });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  return { state, refresh };
}
