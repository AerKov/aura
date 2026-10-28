/** Whether a host matches an allowed entry: exact, or `*.domain` for the domain and subdomains. */
export function hostAllowed(host: string, allowed: readonly string[]): boolean {
  const h = host.toLowerCase();
  return allowed.some((d) =>
    d.startsWith("*.") ? h.endsWith(d.slice(1)) || h === d.slice(2) : h === d,
  );
}
