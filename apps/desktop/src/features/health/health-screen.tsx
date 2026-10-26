import { RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SERVER_URL } from "@/lib/api";
import { useHealth } from "./use-health";
import { useRealtime } from "./use-realtime";

type Status = "ok" | "warn" | "error" | "pending";

function StatusBadge({ status, children }: { status: Status; children: ReactNode }) {
  const variant = status === "error" ? "destructive" : status === "ok" ? "default" : "secondary";
  return <Badge variant={variant}>{children}</Badge>;
}

function Row({ label, value, status }: { label: string; value: ReactNode; status: Status }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <StatusBadge status={status}>{value}</StatusBadge>
    </div>
  );
}

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Phase 0 screen: proves desktop -> server -> SurrealDB works end to end. */
export function HealthScreen() {
  const { state, refresh } = useHealth();
  const realtime = useRealtime();

  const server =
    state.kind === "loading"
      ? { status: "pending" as const, value: "checking..." }
      : state.kind === "unreachable"
        ? { status: "error" as const, value: "unreachable" }
        : {
            status: "ok" as const,
            value: `v${state.report.server.version} · up ${formatUptime(state.report.server.uptimeMs)}`,
          };

  const db =
    state.kind !== "ok"
      ? { status: "pending" as const, value: "unknown" }
      : state.report.db.ok
        ? { status: "ok" as const, value: state.report.db.version }
        : { status: "error" as const, value: "error" };

  const ws =
    realtime.kind === "open"
      ? {
          status: "ok" as const,
          value: realtime.latencyMs === null ? "connected" : `connected · ${realtime.latencyMs} ms`,
        }
      : realtime.kind === "connecting"
        ? { status: "pending" as const, value: "connecting..." }
        : { status: "error" as const, value: "disconnected" };

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>crew</CardTitle>
          <CardDescription>Local server: {SERVER_URL}</CardDescription>
          <CardAction>
            <Button variant="ghost" size="icon" aria-label="Refresh" onClick={() => void refresh()}>
              <RefreshCw />
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="divide-y">
          <Row label="Server" {...server} />
          <Row label="Database" {...db} />
          <Row label="Realtime" {...ws} />
          {state.kind === "unreachable" && (
            <p className="text-destructive pt-3 text-sm">{state.error}</p>
          )}
          {state.kind === "ok" && !state.report.db.ok && (
            <p className="text-destructive pt-3 text-sm">{state.report.db.error}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
