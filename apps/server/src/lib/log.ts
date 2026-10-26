type Level = "debug" | "info" | "warn" | "error";

function write(level: Level, message: string, context?: Record<string, unknown>): void {
  const line = { level, at: new Date().toISOString(), message, ...context };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line));
}

/** Minimal structured logger. Always pass context instead of string-concatenating it. */
export const log = {
  debug: (message: string, context?: Record<string, unknown>) => write("debug", message, context),
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
