/**
 * Environment-driven configuration for every Ollama call in the process.
 * Read once at module load; restart the service to apply changes.
 */

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === "") return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : fallback
}

export const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"

/** Max simultaneous in-flight Ollama requests from this process. */
export const OLLAMA_MAX_CONCURRENCY = envPositiveInt("OLLAMA_MAX_CONCURRENCY", 2)

/**
 * Per-use request timeouts (ms). Each covers the whole call: waiting for a
 * concurrency slot, prompt evaluation and — for streams — the full body.
 */
export const OLLAMA_TIMEOUTS = {
  /** Interactive chat (per conversation and per turn). */
  chat: envPositiveInt("OLLAMA_TIMEOUT_CHAT_MS", 240_000),
  /** Reports / reviews / drafts / autonomous agent runs. */
  report: envPositiveInt("OLLAMA_TIMEOUT_REPORT_MS", 300_000),
  /** Small single-field generation (user story, acceptance criteria). */
  field: envPositiveInt("OLLAMA_TIMEOUT_FIELD_MS", 90_000),
  /** Fallback for callers that do not specify a timeout. */
  default: envPositiveInt("OLLAMA_TIMEOUT_DEFAULT_MS", 300_000),
} as const

export type OllamaTimeoutKind = keyof typeof OLLAMA_TIMEOUTS
