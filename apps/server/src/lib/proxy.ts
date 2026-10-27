/** Proxy settings of the server's environment, passed on to agents' commands and MCP servers. */
const PROXY_KEYS = [
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "NO_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "no_proxy",
  "all_proxy",
];

export function proxyEnv(
  env: Record<string, string | undefined> = process.env,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of PROXY_KEYS) {
    const value = env[key];
    if (value) out[key] = value;
  }
  return out;
}
