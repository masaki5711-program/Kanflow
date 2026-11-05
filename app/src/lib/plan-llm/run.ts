/**
 * One LLM task of the plan assistance (plan 12 §3.3 last row, §3.4): build the prompt from a visible input, ask, check
 * the answer; an invalid answer is retried ONCE, then dropped. A timeout, an unreachable Ollama or any other failure
 * is not retried: the caller falls back to the deterministic path. Every failure is logged (never counted as a
 * success) — the logs carry the task, the reason and the attempt count, never the prompt or the answer text.
 *
 * The LLM itself is injected (`PlanLlm`): the real one is ./ollama-llm.ts; tests pass a fake and never reach Ollama.
 */
import type { ChatMessage } from "@/lib/ollama"
import { aiLog } from "@/lib/ai-monitor"
import { logger } from "@/lib/logger"
import { OllamaAbortedError, OllamaTimeoutError, OllamaUnavailableError } from "@/lib/ollama/errors"
import { buildPrompt, retryMessages } from "./prompt"
import type { ParseResult } from "./parse"
import type { VisibleLlmInput } from "./visible"

const log = logger.child({ module: "plan-llm" })

export type LlmPriority = "user" | "background"

export interface PlanLlmCall {
  priority: LlmPriority
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

export type LlmFailure = "timeout" | "unavailable" | "invalid" | "aborted" | "error"

export type LlmOutcome<T> = { ok: true; value: T; attempts: number } | { ok: false; reason: LlmFailure; attempts: number }

function failureOf(err: unknown): LlmFailure {
  if (err instanceof OllamaTimeoutError) return "timeout"
  if (err instanceof OllamaUnavailableError) return "unavailable"
  if (err instanceof OllamaAbortedError) return "aborted"
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return err.name === "TimeoutError" ? "timeout" : "aborted"
  return "error"
}

/** Ask the LLM for `input`, validating with `parse`. Never throws: the outcome says what happened. */
export async function runLlmTask<T>(llm: PlanLlm, input: VisibleLlmInput, parse: (text: string) => ParseResult<T>, call: PlanLlmCall): Promise<LlmOutcome<T>> {
  const first = buildPrompt(input)
  let messages: ChatMessage[] = first
  const t0 = Date.now()
  for (let attempt = 1; attempt <= 2; attempt++) {
    let text: string
    try {
      text = await llm.chat(messages, call)
    } catch (err) {
      const reason = failureOf(err)
      const fields = { task: input.task, label: call.label, reason, attempt, ms: Date.now() - t0, error: err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200) }
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
    messages = retryMessages(first, text, parsed.problem)
  }
  aiLog("PLAN_LLM", `${call.label}: invalid answer twice — dropped`)
  return { ok: false, reason: "invalid", attempts: 2 }
}
