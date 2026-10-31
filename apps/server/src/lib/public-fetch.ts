import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

const PRIVATE_V4 = [
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./,
  /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./,
  /^0\./,
];

/** An address or name that points at this machine or the local network, by its spelling. */
export function isPrivateHost(hostname: string): boolean {
  let host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) return true;
  // IPv4 written inside IPv6 (::ffff:127.0.0.1, ::ffff:7f00:1) is still IPv4.
  const mapped = /^::ffff:(.+)$/.exec(host);
  if (mapped?.[1]) {
    host = mapped[1];
    const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(host);
    if (hex?.[1] && hex[2]) {
      const a = Number.parseInt(hex[1], 16);
      const b = Number.parseInt(hex[2], 16);
      host = `${a >> 8}.${a & 255}.${b >> 8}.${b & 255}`;
    }
  }
  if (PRIVATE_V4.some((re) => re.test(host))) return true;
  return (
    host === "::1" ||
    host === "::" ||
    host.startsWith("fc") ||
    host.startsWith("fd") ||
    host.startsWith("fe80")
  );
}

export class PrivateAddressError extends Error {
  override name = "PrivateAddressError";
}

type Resolve = (host: string) => Promise<string[]>;

const resolveAll: Resolve = async (host) =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

/**
 * Refuses an address on this machine or the local network: by its spelling, and by every address
 * its name resolves to (so `127.0.0.1.nip.io` is refused too).
 */
export async function assertPublic(url: URL, resolve: Resolve = resolveAll): Promise<void> {
  if (url.protocol !== "https:" && url.protocol !== "http:")
    throw new PrivateAddressError("Only http(s) addresses can be fetched");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isPrivateHost(host)) throw new PrivateAddressError("Local and private addresses are refused");
  if (isIP(host)) return;
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new PrivateAddressError(`${host} could not be found`);
  }
  if (addresses.length === 0 || addresses.some((a) => isPrivateHost(a)))
    throw new PrivateAddressError(`${host} points to a local or private address`);
}

/**
 * Fetches a public address and follows up to five redirects itself, checking every hop before it
 * is requested: a redirect to the user's machine or network is never followed (server-side
 * request forgery).
 */
export async function fetchPublic(
  input: string | URL,
  init: Omit<RequestInit, "redirect"> = {},
  opts: { fetch?: typeof fetch; resolve?: Resolve; maxRedirects?: number } = {},
): Promise<Response> {
  const doFetch = opts.fetch ?? fetch;
  let url = new URL(input);
  for (let hop = 0; ; hop++) {
    await assertPublic(url, opts.resolve);
    const res = await doFetch(url, { ...init, redirect: "manual" });
    const location = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !location) return res;
    if (hop >= (opts.maxRedirects ?? 5)) throw new PrivateAddressError("Too many redirects");
    url = new URL(location, url);
  }
}
