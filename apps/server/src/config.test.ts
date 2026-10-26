import { describe, expect, test } from "bun:test";
import { ConfigError, DEFAULT_PORT, loadConfig } from "./config";

describe("loadConfig", () => {
  test("uses defaults", () => {
    const config = loadConfig({});
    expect(config.host).toBe("127.0.0.1");
    expect(config.port).toBe(DEFAULT_PORT);
    expect(config.dataDir.endsWith(".crew")).toBe(true);
    expect(config.dbUrl).toBe(`surrealkv://${config.dataDir}/state/db`);
  });

  test("reads overrides", () => {
    const config = loadConfig({
      CREW_PORT: "5000",
      CREW_DATA_DIR: "/tmp/crew-test",
      CREW_DB_URL: "mem://",
      CREW_CORS_ORIGINS: "http://a.test, http://b.test",
    });
    expect(config.port).toBe(5000);
    expect(config.dataDir).toBe("/tmp/crew-test");
    expect(config.dbUrl).toBe("mem://");
    expect(config.corsOrigins).toContain("http://b.test");
  });

  test("rejects an invalid port", () => {
    expect(() => loadConfig({ CREW_PORT: "nope" })).toThrow(ConfigError);
    expect(() => loadConfig({ CREW_PORT: "70000" })).toThrow(ConfigError);
  });
});
