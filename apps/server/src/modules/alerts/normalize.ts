import type { AlertSeverity } from "@aura/shared";

export interface NormalizedAlert {
  source: string;
  severity: AlertSeverity;
  title: string;
  summary: string;
  /** Stable identity for deduplication. */
  fingerprint: string;
  raw: string;
}

const MAX_RAW = 4000;
const MAX_TEXT = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string" && typeof value !== "number") return "";
  // Strip control characters; alert text is untrusted and shown in chat.
  const clean = String(value)
    .replace(/\p{Cc}+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function severityOf(value: unknown): AlertSeverity {
  const s = text(value).toLowerCase();
  if (/^(critical|crit|fatal|emergency|alert|p1|high|error|sev1|sev-1)$/.test(s)) return "critical";
  if (/^(warning|warn|p2|p3|medium|sev2|sev-2|sev3|degraded)$/.test(s)) return "warning";
  return s === "resolved" || s === "ok" ? "info" : s ? "info" : "warning";
}

/**
 * Turns a webhook payload into an alert. Understands Alertmanager/Grafana style
 * (`alerts[].labels/annotations`) and a generic `{title, message, severity}` shape; anything else
 * becomes a warning with the payload shown raw.
 */
export function normalizeAlert(source: string, payload: unknown): NormalizedAlert {
  const raw = (() => {
    const json = JSON.stringify(payload ?? null, null, 2) ?? "null";
    return json.length > MAX_RAW ? `${json.slice(0, MAX_RAW)}\n…` : json;
  })();
  const src = text(source, 40) || "webhook";

  if (isRecord(payload) && Array.isArray(payload.alerts) && isRecord(payload.alerts[0])) {
    const first = payload.alerts[0];
    const labels = isRecord(first.labels) ? first.labels : {};
    const annotations = isRecord(first.annotations) ? first.annotations : {};
    const resolved = text(payload.status ?? first.status).toLowerCase() === "resolved";
    const title = text(labels.alertname ?? payload.title ?? annotations.summary) || "Alert";
    const more = payload.alerts.length > 1 ? ` (+${payload.alerts.length - 1} more)` : "";
    return {
      source: src,
      severity: resolved ? "info" : severityOf(labels.severity),
      title: `${resolved ? "Resolved: " : ""}${title}${more}`,
      summary: text(annotations.summary ?? annotations.description ?? payload.message),
      fingerprint: `${src}:${text(first.fingerprint) || title}:${resolved ? "resolved" : "firing"}`,
      raw,
    };
  }

  if (isRecord(payload)) {
    const title =
      text(payload.title ?? payload.name ?? payload.alert ?? payload.subject) || "Alert";
    return {
      source: src,
      severity: severityOf(payload.severity ?? payload.level ?? payload.priority ?? payload.status),
      title,
      summary: text(payload.message ?? payload.summary ?? payload.description ?? payload.text),
      fingerprint: `${src}:${text(payload.fingerprint ?? payload.id) || title}`,
      raw,
    };
  }

  return {
    source: src,
    severity: "warning",
    title: "Alert",
    summary: text(payload),
    fingerprint: `${src}:raw`,
    raw,
  };
}
