import { describe, expect, test } from "bun:test";
import { normalizeAlert, severityOf } from "./normalize";

describe("normalizeAlert", () => {
  test("generic payloads", () => {
    const alert = normalizeAlert("uptime", {
      title: "API down",
      message: "502 from /health",
      severity: "critical",
    });
    expect(alert).toMatchObject({
      source: "uptime",
      severity: "critical",
      title: "API down",
      summary: "502 from /health",
    });
    expect(alert.fingerprint).toBe("uptime:API down");
  });

  test("alertmanager payloads, including resolved", () => {
    const firing = normalizeAlert("prom", {
      status: "firing",
      alerts: [
        {
          labels: { alertname: "HighCPU", severity: "warning" },
          annotations: { summary: "CPU > 90%" },
          fingerprint: "abc",
        },
        { labels: { alertname: "HighCPU" } },
      ],
    });
    expect(firing).toMatchObject({
      severity: "warning",
      title: "HighCPU (+1 more)",
      summary: "CPU > 90%",
      fingerprint: "prom:abc:firing",
    });
    const resolved = normalizeAlert("prom", {
      status: "resolved",
      alerts: [{ labels: { alertname: "HighCPU" } }],
    });
    expect(resolved.severity).toBe("info");
    expect(resolved.title).toBe("Resolved: HighCPU");
  });

  test("untrusted text is cleaned and bounded", () => {
    const alert = normalizeAlert("x\u0000y", { title: `a\u0007b ${"z".repeat(900)}`, message: 42 });
    expect(alert.source).toBe("x y");
    expect(alert.title.length).toBeLessThanOrEqual(500);
    expect(alert.title.startsWith("a b")).toBe(true);
    expect(alert.summary).toBe("42");
    expect(normalizeAlert("s", { big: "q".repeat(10_000) }).raw.length).toBeLessThan(4100);
  });

  test("odd payloads still produce an alert", () => {
    expect(normalizeAlert("s", "plain text").summary).toBe("plain text");
    expect(normalizeAlert("s", null).title).toBe("Alert");
  });

  test("severity mapping", () => {
    expect(severityOf("CRIT")).toBe("critical");
    expect(severityOf("warn")).toBe("warning");
    expect(severityOf("ok")).toBe("info");
    expect(severityOf(undefined)).toBe("warning");
  });
});
