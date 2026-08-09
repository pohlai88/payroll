/**
 * @feature shell
 * @layer repo
 *
 * Postgres driver error helpers (node-pg / Drizzle wrap).
 */

/** Walks `cause` chain for SQLSTATE unique_violation. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  while (current instanceof Error) {
    const { code } = current as Error & { code?: string };
    if (code === "23505") {
      return true;
    }
    current = current.cause;
  }
  return false;
}
