import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { log } from "./log";

export class GitError extends Error {
  override name = "GitError";
}

// Commits made by the app do not depend on the user's git config.
const GIT_ENV = {
  GIT_AUTHOR_NAME: "aura",
  GIT_AUTHOR_EMAIL: "aura@localhost",
  GIT_COMMITTER_NAME: "aura",
  GIT_COMMITTER_EMAIL: "aura@localhost",
  GIT_TERMINAL_PROMPT: "0",
};

/** How often a command waits for another git process to let go of the index. */
const LOCK_RETRIES = 8;

export async function git(cwd: string, args: string[], author?: string): Promise<string> {
  const env: Record<string, string | undefined> = { ...process.env, ...GIT_ENV };
  if (author) {
    env.GIT_AUTHOR_NAME = author;
    env.GIT_AUTHOR_EMAIL = `${author.replace(/[^a-z0-9_-]/gi, "")}@aura.local`;
  }
  for (let attempt = 0; ; attempt++) {
    const proc = Bun.spawn(["git", ...args], { cwd, env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    if (code === 0) return stdout.trim();
    // Another command of the app (e.g. a status check) holds the index for a moment.
    if (stderr.includes("index.lock") && attempt < LOCK_RETRIES) {
      await Bun.sleep(25 * (attempt + 1));
      continue;
    }
    throw new GitError(`git ${args.join(" ")} failed in ${cwd}: ${stderr.trim()}`);
  }
}

/** Creates `dir` as a git repository (idempotent), with an optional .gitignore and first commit. */
export async function ensureRepo(dir: string, gitignore?: string): Promise<void> {
  mkdirSync(dir, { recursive: true });
  if (existsSync(join(dir, ".git"))) return;
  await git(dir, ["init", "-q", "-b", "main"]);
  if (gitignore !== undefined) writeFileSync(join(dir, ".gitignore"), gitignore);
  await git(dir, ["add", "-A"]);
  await git(dir, ["commit", "-q", "--allow-empty", "-m", "chore: initialize"]);
  log.info("git repository initialized", { dir });
}

/** Commits every change in the repo. Returns the short hash, or null when nothing changed. */
export async function commitAll(
  dir: string,
  message: string,
  author?: string,
): Promise<string | null> {
  await git(dir, ["add", "-A"]);
  const status = await git(dir, ["status", "--porcelain"]);
  if (!status) return null;
  await git(dir, ["commit", "-q", "-m", message], author);
  return git(dir, ["rev-parse", "--short", "HEAD"]);
}
