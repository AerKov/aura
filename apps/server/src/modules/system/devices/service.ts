import { timingSafeEqual } from "node:crypto";
import { RecordId, type Surreal } from "surrealdb";
import { isoOf, keyOf, optionalIso } from "../../../db/convert";
import { errorMessage, log } from "../../../lib/log";
import type { SessionUser } from "../auth/sessions";

export class PairingError extends Error {
  override name = "PairingError";
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface Device {
  id: string;
  name: string;
  createdAt: string;
  lastSeenAt: string | null;
  push: boolean;
}

export const PAIRING_TTL_MS = 5 * 60_000;
export const MAX_PAIRING_ATTEMPTS = 5;
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function hash(value: string): string {
  return new Bun.CryptoHasher("sha256").update(value).digest("hex");
}

function sameHash(a: string, b: string): boolean {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** A short code that is easy to type on a phone: 8 unambiguous characters, shown as XXXX-XXXX. */
export function newPairingCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join("");
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type Row = Record<string, unknown>;

/**
 * Paired devices (ADR 0009): the desktop shows a one-time code; a phone exchanges it for a long-lived
 * device token. Only a hash of the token is stored. Devices can be revoked at any time.
 */
export class DeviceService {
  private pairing: { codeHash: string; expiresAt: number; attempts: number } | null = null;
  private readonly cache = new Map<string, { user: SessionUser; at: number }>();
  private readonly lastSeenWrites = new Map<string, number>();

  constructor(private readonly deps: { db: Surreal; owner: SessionUser; now?: () => number }) {}

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  /** Called by the owner on the desktop. A new code replaces the previous one. */
  startPairing(): { code: string; expiresAt: string } {
    const code = newPairingCode();
    const expiresAt = this.now() + PAIRING_TTL_MS;
    this.pairing = { codeHash: hash(normalizeCode(code)), expiresAt, attempts: 0 };
    return { code, expiresAt: new Date(expiresAt).toISOString() };
  }

  async pair(code: string, name: string): Promise<{ token: string; device: Device }> {
    const pending = this.pairing;
    if (!pending || pending.expiresAt < this.now())
      throw new PairingError("No active pairing code. Start pairing on the desktop.");
    if (!sameHash(hash(normalizeCode(code)), pending.codeHash)) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_PAIRING_ATTEMPTS) this.pairing = null;
      throw new PairingError("Wrong code.");
    }
    this.pairing = null;
    const deviceName = name.trim().slice(0, 60) || "Device";
    const token = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
    const id = Bun.randomUUIDv7();
    await this.deps.db
      .query("CREATE $id CONTENT { name: $name, token_hash: $hash, revoked: false }", {
        id: new RecordId("device", id),
        name: deviceName,
        hash: hash(token),
      })
      .collect();
    return { token, device: (await this.get(id)) as Device };
  }

  async verify(token: string): Promise<SessionUser | null> {
    const tokenHash = hash(token);
    const cached = this.cache.get(tokenHash);
    if (cached && this.now() - cached.at < 30_000) return cached.user;
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM device WHERE token_hash = $hash AND revoked = false LIMIT 1", {
        hash: tokenHash,
      })
      .collect();
    const row = rows?.[0];
    if (!row) {
      this.cache.delete(tokenHash);
      return null;
    }
    const user: SessionUser = { ...this.deps.owner, deviceId: keyOf(row.id) };
    this.cache.set(tokenHash, { user, at: this.now() });
    await this.touch(keyOf(row.id));
    return user;
  }

  /**
   * Records when a device was last seen, at most once a minute. A phone opens with several parallel
   * requests; concurrent writes to the same record would conflict, and this write is not critical.
   */
  private async touch(id: string): Promise<void> {
    const last = this.lastSeenWrites.get(id) ?? 0;
    if (this.now() - last < 60_000) return;
    this.lastSeenWrites.set(id, this.now());
    try {
      await this.deps.db
        .query("UPDATE $id SET last_seen_at = time::now()", { id: new RecordId("device", id) })
        .collect();
    } catch (error) {
      log.debug("last_seen update skipped", { device: id, error: errorMessage(error) });
    }
  }

  async get(id: string): Promise<Device | null> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM device WHERE id = $id AND revoked = false", {
        id: new RecordId("device", id),
      })
      .collect();
    const row = rows?.[0];
    return row ? toDevice(row) : null;
  }

  async list(): Promise<Device[]> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT * FROM device WHERE revoked = false ORDER BY created_at")
      .collect();
    return (rows ?? []).map(toDevice);
  }

  async revoke(id: string): Promise<void> {
    await this.deps.db
      .query("UPDATE $id SET revoked = true, push = NONE", { id: new RecordId("device", id) })
      .collect();
    this.cache.clear();
  }

  async setPush(id: string, subscription: PushSubscription | null): Promise<void> {
    await this.deps.db
      .query("UPDATE $id SET push = $push", {
        id: new RecordId("device", id),
        push: subscription ?? undefined,
      })
      .collect();
  }

  async pushTargets(): Promise<{ id: string; subscription: PushSubscription }[]> {
    const [rows] = await this.deps.db
      .query<[Row[]]>("SELECT id, push FROM device WHERE revoked = false AND push != NONE")
      .collect();
    return (rows ?? []).map((row) => ({
      id: keyOf(row.id),
      subscription: row.push as PushSubscription,
    }));
  }
}

function toDevice(row: Row): Device {
  return {
    id: keyOf(row.id),
    name: String(row.name),
    createdAt: isoOf(row.created_at),
    lastSeenAt: optionalIso(row.last_seen_at),
    push: Boolean(row.push),
  };
}
