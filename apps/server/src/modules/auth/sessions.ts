import { timingSafeEqual } from "node:crypto";

export interface SessionUser {
  id: string;
  name: string;
  /** Set when the request comes from a paired device (ADR 0009). */
  deviceId?: string;
}

/**
 * Automatic local sessions (ADR 0003). Tokens live in memory: a server restart invalidates them and
 * the client silently requests a new one.
 */
export class LocalSessions {
  private readonly tokens = new Map<string, SessionUser>();
  private deviceVerifier: ((token: string) => Promise<SessionUser | null>) | null = null;

  /** Lets paired-device tokens authenticate too (set once devices are available). */
  useDevices(verifier: (token: string) => Promise<SessionUser | null>): void {
    this.deviceVerifier = verifier;
  }

  /** Local session first, then a paired device token. */
  async authenticate(token: string | null | undefined): Promise<SessionUser | null> {
    if (!token) return null;
    return this.verify(token) ?? (await this.deviceVerifier?.(token)) ?? null;
  }

  issue(user: SessionUser): string {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const token = Buffer.from(bytes).toString("base64url");
    this.tokens.set(token, user);
    return token;
  }

  verify(token: string | null | undefined): SessionUser | null {
    if (!token) return null;
    for (const [known, user] of this.tokens) {
      if (
        known.length === token.length &&
        timingSafeEqual(Buffer.from(known), Buffer.from(token))
      ) {
        return user;
      }
    }
    return null;
  }
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]"]);

/** Rejects requests whose Host is not loopback, which blocks DNS-rebinding attacks from websites. */
export function isLoopbackHost(hostHeader: string | null, extraHosts: string[] = []): boolean {
  if (!hostHeader) return false;
  const host = hostHeader.startsWith("[")
    ? hostHeader.slice(0, hostHeader.indexOf("]") + 1)
    : (hostHeader.split(":")[0] ?? "");
  const name = host.toLowerCase();
  return LOOPBACK_HOSTS.has(name) || extraHosts.includes(name);
}
