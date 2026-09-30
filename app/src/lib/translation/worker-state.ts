import type { TranslationStatus } from "./types"

/**
 * Background-worker state transitions (pure). The caller applies the result
 * to the database.
 *
 * - success   → done, the opposite-locale column gets the translation.
 * - preempted → back to pending (attempts unchanged: we only yielded to a user).
 * - failure   → attempts+1; MAX_ATTEMPTS → failed, otherwise pending + backoff.
 */
export const MAX_ATTEMPTS = 5
export const BACKOFF_BASE_MS = 60_000
/** A row left `running` longer than this is treated as abandoned and reset. */
export const RUNNING_TIMEOUT_MS = 5 * 60_000

export type WorkerOutcome =
  | { kind: "success"; translated: string; model: string }
  | { kind: "preempted" }
  | { kind: "failure"; error: string }

export interface RowState {
  attempts: number
}

export interface NextState {
  status: TranslationStatus
  attempts: number
  lastError: string | null
  /** Next eligible time when going back to pending (backoff); otherwise null. */
  requestedAt: Date | null
  translated?: string
  model?: string
}

export function nextState(row: RowState, outcome: WorkerOutcome, now = new Date()): NextState {
  switch (outcome.kind) {
    case "success":
      return {
        status: "done",
        attempts: row.attempts,
        lastError: null,
        requestedAt: null,
        translated: outcome.translated,
        model: outcome.model,
      }
    case "preempted":
      return { status: "pending", attempts: row.attempts, lastError: null, requestedAt: now }
    case "failure": {
      const attempts = row.attempts + 1
      if (attempts >= MAX_ATTEMPTS) {
        return { status: "failed", attempts, lastError: outcome.error, requestedAt: null }
      }
      return {
        status: "pending",
        attempts,
        lastError: outcome.error,
        requestedAt: new Date(now.getTime() + attempts * BACKOFF_BASE_MS),
      }
    }
  }
}
