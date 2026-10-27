import { afterEach, describe, expect, test } from "bun:test";
import type { ServerEvent } from "@aura/shared";
import { treaty } from "@elysiajs/eden";
import { createApp } from "../../app";
import { createTestApp } from "../../testing";
import {
  NotificationService,
  notificationFor,
  PushGoneError,
  type PushSender,
} from "./notifications";
import { MAX_PAIRING_ATTEMPTS, newPairingCode, normalizeCode } from "./service";

type TestApp = Awaited<ReturnType<typeof createTestApp>>;

describe("device pairing", () => {
  let t: TestApp | undefined;
  afterEach(async () => {
    await t?.close();
    t = undefined;
  });

  test("codes are typeable", () => {
    expect(newPairingCode()).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeCode(" ab12-cd34 ")).toBe("AB12CD34");
  });

  test("pair with a one-time code, use the device token, revoke it", async () => {
    t = await createTestApp();
    const desktop = treaty(t.app, { headers: { authorization: `Bearer ${t.token}` } });
    const anonymous = treaty(t.app);

    expect((await anonymous.devices.pair.post({ code: "AAAA-AAAA", name: "Phone" })).status).toBe(
      401,
    );
    const { data: pairing } = await desktop.devices.pairing.post();
    const code = pairing?.code ?? "";
    expect((await anonymous.devices.pair.post({ code: "WRNG-CODE", name: "Phone" })).status).toBe(
      401,
    );
    const { data: paired } = await anonymous.devices.pair.post({
      code: code.toLowerCase(),
      name: "Pixel",
    });
    expect(paired?.device.name).toBe("Pixel");
    // One-time: the same code cannot pair a second device.
    expect((await anonymous.devices.pair.post({ code, name: "Again" })).status).toBe(401);

    const phone = treaty(t.app, { headers: { authorization: `Bearer ${paired?.token}` } });
    expect((await phone.chats.get()).status).toBe(200);
    expect((await phone.devices.me.get()).data?.deviceId).toBe(paired?.device.id ?? "");
    // A phone cannot pair further devices.
    expect((await phone.devices.pairing.post()).status).toBe(403);

    expect((await desktop.devices.get()).data?.map((d) => d.name)).toEqual(["Pixel"]);
    await desktop.devices({ deviceId: paired?.device.id ?? "" }).delete();
    expect((await phone.chats.get()).status).toBe(401);
  });

  test("too many wrong codes cancel the pairing", async () => {
    t = await createTestApp();
    const { code } = t.devices.startPairing();
    for (let i = 0; i < MAX_PAIRING_ATTEMPTS; i++)
      await expect(t.devices.pair("ZZZZ-ZZZZ", "x")).rejects.toThrow();
    await expect(t.devices.pair(code, "x")).rejects.toThrow(/No active pairing code/);
  });

  test("expired codes are refused", async () => {
    let now = 0;
    t = await createTestApp();
    const { DeviceService } = await import("./service");
    const devices = new DeviceService({ db: t.db.surreal, owner: t.owner, now: () => now });
    const { code } = devices.startPairing();
    now = 6 * 60_000;
    await expect(devices.pair(code, "x")).rejects.toThrow(/No active pairing code/);
  });

  test("remote mode accepts other hosts for token routes, never for the local session", async () => {
    t = await createTestApp();
    const remote = createApp({
      ...t,
      dbHealth: t.db.health,
      startedAt: Date.now(),
      corsOrigins: ["http://localhost:1420"],
      webhookToken: "x",
      publicUrl: "http://192.168.1.5:4517",
      pushPublicKey: null,
      webDir: null,
      lanUrls: [],
      remote: true,
    });
    const lan = { host: "192.168.1.5:4517" };
    const chats = await remote.handle(
      new Request("http://192.168.1.5:4517/chats", {
        headers: { ...lan, authorization: `Bearer ${t.token}` },
      }),
    );
    expect(chats.status).toBe(200);
    const noToken = await remote.handle(
      new Request("http://192.168.1.5:4517/chats", { headers: lan }),
    );
    expect(noToken.status).toBe(401);
    const session = await remote.handle(
      new Request("http://192.168.1.5:4517/session/local", {
        method: "POST",
        headers: { ...lan, origin: "http://localhost:1420" },
      }),
    );
    expect(session.status).toBe(403);
  });
});

describe("notifications", () => {
  const message = (extra: Record<string, unknown>) =>
    ({
      id: "m1",
      chatId: "direct",
      author: { kind: "agent", id: "orchestrator" },
      kind: "text",
      body: "Done: the **CLI** is ready",
      card: null,
      replyTo: null,
      mentions: [],
      status: "final",
      chainDepth: 1,
      runId: null,
      usage: null,
      error: null,
      createdAt: "t",
      updatedAt: "t",
      ...extra,
    }) as never;
  const kind = (id: string) => (id === "direct" ? "direct" : "group");

  test("what deserves a notification", () => {
    expect(notificationFor({ type: "message.updated", message: message({}) }, kind)?.body).toBe(
      "Done: the CLI is ready",
    );
    expect(
      notificationFor({ type: "message.updated", message: message({ chatId: "p" }) }, kind),
    ).toBeNull();
    expect(
      notificationFor({ type: "message.updated", message: message({ status: "streaming" }) }, kind),
    ).toBeNull();
    const approval = {
      type: "approval",
      approvalId: "a1",
      status: "pending",
      title: "Start project",
    };
    expect(
      notificationFor(
        { type: "message.created", message: message({ kind: "card", card: approval }) },
        kind,
      )?.title,
    ).toBe("Approval needed");
    const warning = { type: "alert", severity: "warning", source: "s", title: "t" };
    expect(
      notificationFor(
        { type: "message.created", message: message({ kind: "card", card: warning }) },
        kind,
      ),
    ).toBeNull();
  });

  test("pushes once per event to subscribed devices and drops expired subscriptions", async () => {
    const t = await createTestApp();
    try {
      const { code } = t.devices.startPairing();
      const { device } = await t.devices.pair(code, "Phone");
      await t.devices.setPush(device.id, {
        endpoint: "https://push.example/1",
        keys: { p256dh: "k", auth: "a" },
      });

      const sent: string[] = [];
      let gone = false;
      const sender: PushSender = {
        async send(_subscription, payload) {
          if (gone) throw new PushGoneError("gone");
          sent.push(payload);
        },
      };
      const events: ServerEvent[] = [];
      t.hub.subscribe((e) => events.push(e));
      const stop = new NotificationService({
        hub: t.hub,
        devices: t.devices,
        sender,
        chatKind: kind,
      }).start();

      const event: ServerEvent = { type: "message.updated", message: message({}) };
      t.hub.publish(event);
      t.hub.publish(event);
      await Bun.sleep(20);
      expect(sent).toHaveLength(1);
      expect(JSON.parse(sent[0] ?? "{}")).toMatchObject({
        title: "Orchestrator",
        chatId: "direct",
      });
      expect(events.filter((e) => e.type === "notification")).toHaveLength(1);

      gone = true;
      t.hub.publish({ type: "message.updated", message: message({ id: "m2" }) });
      await Bun.sleep(20);
      expect(await t.devices.pushTargets()).toHaveLength(0);
      stop();
    } finally {
      await t.close();
    }
  });
});

test("many parallel requests from a new device do not conflict", async () => {
  const t = await createTestApp();
  try {
    const { code } = t.devices.startPairing();
    const { token } = await t.devices.pair(code, "Phone");
    const phone = treaty(t.app, { headers: { authorization: `Bearer ${token}` } });
    const results = await Promise.all(Array.from({ length: 12 }, () => phone.chats.get()));
    expect(results.map((r) => r.status)).toEqual(new Array(12).fill(200));
  } finally {
    await t.close();
  }
});
