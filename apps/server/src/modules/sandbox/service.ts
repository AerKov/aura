import { homedir } from "node:os";
import { join } from "node:path";
import { sandboxSupport } from "../../providers/shell-sandbox";
import type { SandboxPolicy } from "../../providers/types";
import { type AgentNetwork, DEFAULT_NETWORK } from "../agents/profiles";
import { type SandboxPatch, type SandboxSettings, SandboxStore } from "./settings";

/** Credentials and the app's own state: never readable from an agent's shell (rules 4, 9). */
export function deniedReads(dataDir: string, home = homedir()): string[] {
  return [
    join(dataDir, "state"),
    ...[
      ".ssh",
      ".aws",
      ".azure",
      ".gnupg",
      ".kube",
      ".docker",
      ".netrc",
      ".npmrc",
      ".pypirc",
      ".git-credentials",
      ".config/gh",
      ".config/gcloud",
      ".claude",
      ".claude.json",
      ".gemini",
      ".codex",
      ".local/share/opencode",
    ].map((p) => join(home, p)),
  ];
}

export interface SandboxStatus extends SandboxSettings {
  /** This machine can run the sandbox. */
  available: boolean;
  reason: string | null;
  /** Shell commands run sandboxed now. */
  active: boolean;
}

/** The OS sandbox for agents' shell commands (ADR 0015). */
export class SandboxService {
  readonly store: SandboxStore;

  constructor(
    private readonly opts: {
      dataDir: string;
      /** Replaced in tests. */
      support?: () => { ok: true } | { ok: false; reason: string };
    },
  ) {
    this.store = new SandboxStore(opts.dataDir);
  }

  status(): SandboxStatus {
    const settings = this.store.get();
    const support = (this.opts.support ?? sandboxSupport)();
    return {
      ...settings,
      available: support.ok,
      reason: support.ok ? null : support.reason,
      active: settings.mode !== "off" && support.ok,
    };
  }

  /**
   * The policy for a run, or null when commands run without the sandbox. In `required` mode the
   * policy is returned even when the sandbox is unavailable, so commands fail instead.
   */
  policy(network?: AgentNetwork): SandboxPolicy | null {
    const status = this.status();
    if (status.mode === "off") return null;
    if (status.mode === "auto" && !status.available) return null;
    return {
      required: status.mode === "required",
      allowedDomains: this.hostsFor(network),
      denyRead: deniedReads(this.opts.dataDir),
    };
  }

  /** Hosts an agent may reach: the shared list (unless it opted out) and its own (ADR 0022). */
  hostsFor(network: AgentNetwork = DEFAULT_NETWORK): string[] {
    const shared = network.shared ? this.store.get().allowedDomains : [];
    return [...new Set([...shared, ...network.hosts])];
  }

  update(patch: SandboxPatch): Promise<SandboxSettings> {
    return this.store.update(patch);
  }
}

/** What an agent with WebFetch limited to its hosts is told. */
export function webNote(hosts: string[]): string {
  return `

## Web pages
WebFetch reaches only these hosts: ${hosts.length > 0 ? hosts.join(", ") : "none"}. Ask the user if you need another one.`;
}

/** What an agent with a shell is told, so it does not fight the sandbox. */
export function sandboxNote(policy: SandboxPolicy): string {
  const hosts = policy.allowedDomains.length > 0 ? policy.allowedDomains.join(", ") : "none";
  return `

## Shell sandbox
Your shell commands run in a sandbox: you can write only inside the project folder and the temp folder, credentials are not readable, and the network reaches only these hosts: ${hosts}. If a command is blocked, do not try to get around it; tell the user what you need.`;
}
