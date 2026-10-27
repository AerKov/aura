import { DateTime, RecordId } from "surrealdb";

/** Record key as a string (`chat:abc` -> `abc`). */
export function keyOf(value: unknown): string {
  if (value instanceof RecordId) return String(value.id);
  if (typeof value === "string")
    return value.includes(":") ? value.slice(value.indexOf(":") + 1) : value;
  throw new TypeError(`Expected a record id, got ${typeof value}`);
}

export function optionalKey(value: unknown): string | null {
  return value === undefined || value === null ? null : keyOf(value);
}

export function isoOf(value: unknown): string {
  if (value instanceof DateTime) return value.toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  throw new TypeError(`Expected a datetime, got ${typeof value}`);
}

export function optionalIso(value: unknown): string | null {
  return value === undefined || value === null ? null : isoOf(value);
}

/**
 * Retries an operation that failed with a SurrealDB transaction conflict (optimistic concurrency:
 * concurrent writes to one record). Other errors are rethrown at once.
 */
export async function retryOnConflict<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (error) {
      const conflict =
        error instanceof Error &&
        /transaction (write )?conflict|can be retried/i.test(error.message);
      if (!conflict || i >= attempts) throw error;
      await Bun.sleep(5 * i + Math.random() * 10);
    }
  }
}
