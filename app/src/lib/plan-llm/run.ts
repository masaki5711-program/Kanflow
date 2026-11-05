/**
 * One LLM task of the plan assistance (plan 12 §3.3 last row, §3.4): build the prompt from a visible input, ask, check
 * the answer; an invalid answer is retried ONCE, then dropped. A timeout, an unreachable Ollama or any other failure
 * is not retried: the caller falls back to the deterministic path. `timeoutMs` is the budget of the WHOLE task (both
 * attempts together), so a slow model cannot hold a proposal for twice the timeout. Every failure is logged (never
 * counted as a success) — the logs carry the task, the reason and the attempt count, never the prompt or the answer.
 *
 * The LLM itself is injected (`PlanLlm`): the real one is ./ollama-llm.ts; tests pass a fake and never reach Ollama.
 */
import type { ChatMessage } from "@/lib/ollama"
import { aiLog } from "@/lib/ai-monitor"
import { logger } from "@/lib/logger"
import { OllamaAbortedError, OllamaHttpError, OllamaTimeoutError, OllamaUnavailableError } from "@/lib/ollama/errors"
import { buildPrompt, retryMessages } from "./prompt"
import type { ParseResult } from "./parse"
import type { VisibleLlmInput } from "./visible"

const log = logger.child({ module: "plan-llm" })

export type LlmPriority = "user" | "background"

export interface PlanLlmCall {
  priority: LlmPriority
  /** Budget of the whole task (every attempt together). */
  timeoutMs: number
  signal?: AbortSignal
  /** Short name for logs ("plan-candidates", "plan-explanation", "plan-rule-drafts"). */
  label: string
}

/** The model behind the assistance. `chat` resolves with the answer text or rejects (typed Ollama errors). */
export interface PlanLlm {
  readonly model: string
  chat(messages: ChatMessage[], call: PlanLlmCall): Promise<string>
}

/** `http`: Ollama answered with an error status (model loading, out of memory): worth another try later. */
export type LlmFailure = "timeout" | "unavailable" | "http" | "invalid" | "aborted" | "error"

export type LlmOutcome<T> = { ok: true; value: T; attempts: number } | { ok: false; reason: LlmFailure; attempts: number }

/** Below this, a second attempt is not started (it could not finish anyway). */
const MIN_ATTEMPT_MS = 1_000

function failureOf(err: unknown): LlmFailure {
  if (err instanceof OllamaTimeoutError) return "timeout"
  if (err instanceof OllamaUnavailableError) return "unavailable"
  if (err instanceof OllamaAbortedError) return "aborted"
  if (err instanceof OllamaHttpError) return "http"
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return err.name === "TimeoutError" ? "timeout" : "aborted"
  return "error"
}

const brief = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200)

/** Ask the LLM for `input`, validating with `parse`. Never throws: the outcome says what happened. */
export async function runLlmTask<T>(llm: PlanLlm, input: VisibleLlmInput, parse: (text: string) => ParseResult<T>, call: PlanLlmCall): Promise<LlmOutcome<T>> {
  const t0 = Date.now()
  const deadline = t0 + call.timeoutMs
  let attempt = 0
  try {
    const first = buildPrompt(input)
    let messages: ChatMessage[] = first
    for (attempt = 1; attempt <= 2; attempt++) {
      const left = deadline - Date.now()
      if (attempt > 1 && left < MIN_ATTEMPT_MS) {
        log.warn("plan llm retry skipped: no time left", { task: input.task, label: call.label, ms: Date.now() - t0 })
        aiLog("PLAN_LLM", `${call.label}: invalid answer, no time for a retry — dropped`)
        return { ok: false, reason: "invalid", attempts: attempt - 1 }
      }
      let text: string
      try {
        text = await llm.chat(messages, { ...call, timeoutMs: Math.max(left, 1) })
      } catch (err) {
        const reason = failureOf(err)
        const fields = { task: input.task, label: call.label, reason, attempt, ms: Date.now() - t0, error: brief(err) }
        if (reason === "aborted") log.info("plan llm call cancelled; deterministic path", fields)
        else log.warn("plan llm call failed; deterministic path", fields)
        aiLog("PLAN_LLM", `${call.label}: ${reason} after ${Date.now() - t0}ms (attempt ${attempt}) — fallback`)
        return { ok: false, reason, attempts: attempt }
      }
      const parsed = parse(text)
      if (parsed.ok) {
        if (attempt > 1) log.info("plan llm answer valid on retry", { task: input.task, label: call.label })
        return { ok: true, value: parsed.value, attempts: attempt }
      }
      log.warn("plan llm answer invalid", { task: input.task, label: call.label, attempt, problem: parsed.problem, answerChars: text.length })
      if (attempt === 2) break
      messages = retryMessages(first, parsed.problem)
    }
    aiLog("PLAN_LLM", `${call.label}: invalid answer twice — dropped`)
    return { ok: false, reason: "invalid", attempts: 2 }
  } catch (err) {
    // A defect on our side (prompt building, a validator): still the deterministic path, but loudly.
    log.error("plan llm task failed unexpectedly; deterministic path", { task: input.task, label: call.label, attempt, error: brief(err), stack: err instanceof Error ? err.stack?.slice(0, 1_000) : undefined })
    return { ok: false, reason: "error", attempts: attempt }
  }
}
