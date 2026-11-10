/**
 * Configuration of the LLM assistance of the schedule from actuals (plan 12 §3.4, E6). Pure; read from an env object.
 *
 * PLAN_LLM_ASSIST            on (default) | off — off: everything stays deterministic, nothing is sent to Ollama.
 * PLAN_LLM_TIMEOUT_MS        interactive calls (proposal: candidate review, explanation), default 60 000.
 * PLAN_LLM_BATCH_TIMEOUT_MS  the night batch (rule drafts at actuals finalization), default 300 000.
 * PLAN_RULE_DRAFT_SCHEDULE   worker times of the night batch (HH:MM[,HH:MM]), default 02:30; off = no batch.
 *
 * The interactive calls run at "user" priority, the batch at "background" priority behind every user call, so the
 * shared Ollama (BankMasalah, the L-5 conflict assistant) keeps its interactive slots (plan 12 §6 M5).
 */

/** Bumped whenever a system prompt or an output schema below changes; stored with every run and draft job. */
export const PLAN_LLM_PROMPT_VERSION = "e6-v1"
/** The same for the AI review of finalized actuals (its own prompt; stored with every review job and proposal). */
export const ACTUALS_REVIEW_PROMPT_VERSION = "e6r-v1"

export const DEFAULT_PLAN_LLM_TIMEOUT_MS = 60_000
export const DEFAULT_PLAN_LLM_BATCH_TIMEOUT_MS = 300_000
export const DEFAULT_PLAN_RULE_DRAFT_SCHEDULE = "02:30"

type Env = Readonly<Record<string, string | undefined>>

const OFF = new Set(["off", "false", "0", "no", "disabled", "none"])

function positiveInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export interface PlanLlmConfig {
  enabled: boolean
  interactiveTimeoutMs: number
  batchTimeoutMs: number
}

export function planLlmConfig(env: Env): PlanLlmConfig {
  return {
    enabled: !OFF.has((env.PLAN_LLM_ASSIST ?? "").trim().toLowerCase()),
    interactiveTimeoutMs: positiveInt(env.PLAN_LLM_TIMEOUT_MS, DEFAULT_PLAN_LLM_TIMEOUT_MS),
    batchTimeoutMs: positiveInt(env.PLAN_LLM_BATCH_TIMEOUT_MS, DEFAULT_PLAN_LLM_BATCH_TIMEOUT_MS),
  }
}
