import { envPositiveInt } from "@/lib/ai-gate/config"
import { DEFAULT_AI_JOB_POLL_MS, DEFAULT_AI_JOB_STALE_MS } from "./runner"

/** Pure (no DB) so the worker config / --dry-run can read it. */

/** Upper bound of one wait for busy users before a job starts anyway. */
export const DEFAULT_AI_JOB_YIELD_MAX_MS = 10 * 60_000

export interface AiJobRunnerEnvConfig {
  pollMs: number
  staleMs: number
  yieldMaxMs: number
}

/** AI_JOB_POLL_MS (5 s), AI_JOB_STALE_MS (30 min), AI_JOB_YIELD_MAX_MS (10 min). */
export function loadAiJobRunnerConfig(env: Readonly<Record<string, string | undefined>>): AiJobRunnerEnvConfig {
  return {
    pollMs: envPositiveInt(env.AI_JOB_POLL_MS, DEFAULT_AI_JOB_POLL_MS),
    staleMs: envPositiveInt(env.AI_JOB_STALE_MS, DEFAULT_AI_JOB_STALE_MS),
    yieldMaxMs: envPositiveInt(env.AI_JOB_YIELD_MAX_MS, DEFAULT_AI_JOB_YIELD_MAX_MS),
  }
}
