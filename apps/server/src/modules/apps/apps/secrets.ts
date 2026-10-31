import { log } from "../../../lib/log";
import { SecretVault } from "../../../lib/secret-vault";
import { ENV_NAME } from "../../helpers/agents/env";

export class AppSecretError extends Error {
  override name = "AppSecretError";
}

/**
 * Each app's own secrets (ADR 0030), kept apart in the one secret store (ADR 0039). An app's values
 * are put into its own requests to its granted hosts and nowhere else: no other app, no agent and
 * no frame ever gets them; the API returns names only.
 */
export class AppSecrets {
  private readonly vault: SecretVault;

  constructor(dataDir: string) {
    this.vault = SecretVault.for(dataDir);
  }

  get(app: string, name: string): string | null {
    return this.vault.appSecret(app, name);
  }

  /** Names with a value, for one app. */
  names(app: string): string[] {
    return this.vault.appSecretNames(app);
  }

  /** Every stored value, to redact them from what people and models see. */
  values(): string[] {
    return this.vault.appValues();
  }

  set(app: string, name: string, value: string | null): void {
    if (!ENV_NAME.test(name))
      throw new AppSecretError(`${name} is not a name like SERVICE_API_KEY`);
    if (value !== null && (value.length === 0 || value.length > 8000))
      throw new AppSecretError("A secret must be 1 to 8000 characters");
    this.vault.setAppSecrets([[app, name, value]]);
    log.info("app secret updated", { app, name, set: value !== null });
  }

  /** Forgets every secret of an app (it was removed). */
  drop(app: string): void {
    this.vault.dropApp(app);
  }
}
