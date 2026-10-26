import { afterAll, describe, expect, test } from "bun:test";
import { connectDb, type Db } from "./client";

describe("connectDb", () => {
  let db: Db | undefined;

  afterAll(async () => {
    await db?.close();
  });

  test("opens an in-memory database and reports health", async () => {
    db = await connectDb("mem://");
    const health = await db.health();
    expect(health.ok).toBe(true);
    if (health.ok) expect(health.version).toStartWith("surrealdb-");
  });
});
