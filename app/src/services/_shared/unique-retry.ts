import { isUniqueViolation } from "./errors"

/** Default attempts for "max + 1" numbering that races with concurrent creates. */
export const UNIQUE_RETRY_ATTEMPTS = 3

/** 409 message when every retry lost the per-project displayId race. */
export const DISPLAY_ID_CONFLICT = "番号の採番が競合しました。もう一度お試しください"

/**
 * Run `fn` again when it fails with a unique constraint violation (P2002),
 * up to `attempts` times in total; any other error, or the last P2002, is
 * rethrown. `fn` must be self-contained (e.g. a whole transaction that
 * re-reads the next number), since a failed attempt is simply repeated.
 */
export async function retryOnUniqueViolation<T>(
  fn: (attempt: number) => Promise<T>,
  attempts: number = UNIQUE_RETRY_ATTEMPTS
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt)
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= attempts) throw err
    }
  }
}
