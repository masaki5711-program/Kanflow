/**
 * The real `PlanLlm`: Kanflow's shared Ollama client (lib/ollama.ts → lib/ollama/client.ts), so the process-wide
 * concurrency limit, the user-first priority queue and the typed errors apply. The analysis model is used (the
 * resident one, same num_ctx as every other feature: no model switch, no reload). "user" calls enter the translation
 * priority gate; "background" calls (the night batch) queue behind every user call.
 */
import { ollamaChat, OLLAMA_MODELS } from "@/lib/ollama"
import { planLlmConfig } from "./config"
import type { PlanLlm } from "./run"

export function ollamaPlanLlm(): PlanLlm {
  return {
    model: OLLAMA_MODELS.analysis,
    chat: (messages, call) =>
      ollamaChat(messages, {
        role: "analysis",
        format: "json",
        temperature: 0.1,
        numPredict: 2_048,
        // No tools, ever (plan 12 §3.4 item 3): the answer is data for the validators in ./parse.ts.
        background: call.priority === "background",
        timeoutMs: call.timeoutMs,
        signal: call.signal,
        label: call.label,
      }),
  }
}

/** The plan LLM when the assistance is on (PLAN_LLM_ASSIST), else null: the deterministic path only. */
export function planLlmFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): PlanLlm | null {
  return planLlmConfig(env).enabled ? ollamaPlanLlm() : null
}
