import { log } from "../../lib/log";
import { SecretVault } from "../../lib/secret-vault";
import { ENV_NAME } from "./env";

export class SecretError extends Error {
  override name = "SecretError";
}

/**
 * Agents' secrets, values for `${secret:NAME}` (ADR 0020, ADR 0030), kept in the one secret store
 * (ADR 0039). Values never leave the server except into the processes that use them; the API
 * returns names only.
 */
export class SecretStore {
  private readonly vault: SecretVault;

  constructor(dataDir: string) {
    this.vault = SecretVault.for(dataDir);
  }

  names(): string[] {
    return this.vault.agentSecretNames();
  }

  get(name: string): string | null {
    return this.vault.agentSecret(name);
  }

  /** Every stored value, to redact them from what people and models see. */
  values(): string[] {
    return this.vault.agentValues();
  }

  set(name: string, value: string | null): void {
    if (!ENV_NAME.test(name)) throw new SecretError(`${name} is not a name like SERVICE_API_KEY`);
    if (value !== null && (value.length === 0 || value.length > 8000))
      throw new SecretError("A secret must be 1 to 8000 characters");
    this.vault.setAgentSecret(name, value);
    log.info("agent secret updated", { name, set: value !== null });
  }
}
