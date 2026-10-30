import { homedir } from "node:os";
import { join } from "node:path";
import { sandboxSupport } from "../../../providers/shell-sandbox";
import type { SandboxPolicy } from "../../../providers/types";
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
   * policy is returned even when the sandbox is unavailable, so commands fail instead. Commands
   * reach no network (ADR 0030).
   */
  policy(): SandboxPolicy | null {
    const status = this.status();
    if (status.mode === "off") return null;
    if (status.mode === "auto" && !status.available) return null;
    return {
      required: status.mode === "required",
      allowedDomains: [],
      denyRead: deniedReads(this.opts.dataDir),
    };
  }

  update(patch: SandboxPatch): Promise<SandboxSettings> {
    return this.store.update(patch);
  }
}

/** What an agent with a shell is told, so it does not fight the sandbox. */
export function sandboxNote(): string {
  return `

## Shell sandbox
Your shell commands run in a sandbox: you can write only inside the project folder and the temp folder, credentials are not readable, and there is no network (installing packages from the internet does not work). If a command is blocked, do not try to get around it; tell the user what you need.`;
}
