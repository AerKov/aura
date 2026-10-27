/** Whether a host matches an allowed entry: exact, or `*.domain` for the domain and subdomains. */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((d) =>
    d.startsWith("*.") ? h.endsWith(d.slice(1)) || h === d.slice(2) : h === d,
  );
}

/** What an agent is told when WebFetch is refused by its network rules (ADR 0022). */
export function webDenied(host: string, hosts: readonly string[]): string {
  return `${host} is not among this agent's allowed hosts (${hosts.join(", ") || "none"}). Ask the user to add it on the Agents page.`;
}
