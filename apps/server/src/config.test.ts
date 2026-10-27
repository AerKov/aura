import { describe, expect, test } from "bun:test";
import { ConfigError, DEFAULT_PORT, loadConfig } from "./config";

describe("loadConfig", () => {
  test("uses defaults", () => {
    const config = loadConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.dataDir.endsWith(".aura")).toBe(true);
    expect(config.dbUrl).toBe(`surrealkv://${config.dataDir}/state/db`);
  });

  test("reads overrides", () => {
    const config = loadConfig({
      AURA_PORT: "5000",
      AURA_DATA_DIR: "/tmp/aura-test",
      AURA_DB_URL: "mem://",
      AURA_CORS_ORIGINS: "http://a.test, http://b.test",
    });
    expect(config.port).toBe(5000);
    expect(config.dataDir).toBe("/tmp/aura-test");
    expect(config.dbUrl).toBe("mem://");
    expect(config.corsOrigins).toContain("http://b.test");
  });

  test("rejects an invalid port", () => {
    expect(() => loadConfig({ AURA_PORT: "nope" })).toThrow(ConfigError);
    expect(() => loadConfig({ AURA_PORT: "70000" })).toThrow(ConfigError);
  });
});
