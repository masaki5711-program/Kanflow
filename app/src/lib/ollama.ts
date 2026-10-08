import { OLLAMA_BASE_URL, OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { ollamaRequest, type OllamaEndpoint } from "@/lib/ollama/client"

export { OLLAMA_BASE_URL, OLLAMA_TIMEOUTS }

/**
 * High-level Ollama helpers (model roles, message normalization, response
 * shaping). All transport — timeouts, abort, the process-wide concurrency
 * limit, priority-gate registration and error typing — lives in
 * lib/ollama/client.ts.
 *
 * Every helper is a user-facing (high priority) call unless the caller
 * passes `background: true`. High-priority entry aborts any running
 * background translation (lib/translation/priority-gate.ts) and is released
 * when the call — including a consumed or abandoned stream — ends.
 *
 * Failures are typed (lib/ollama/errors.ts): OllamaTimeoutError,
 * OllamaUnavailableError, OllamaAbortedError, OllamaHttpError.
 */

// Default fallback for legacy callers that don't specify a model.
const OLLAMA_DEFAULT = process.env.OLLAMA_MODEL ?? "qwen3.8:27b-q4_K_M"

/**
 * Purpose-specific model selection. Each role can be overridden by env var.
 * - translate: same large reasoning model as analysis so the two roles share
 *   a single resident model — `OLLAMA_MAX_LOADED_MODELS=1` therefore never
 *   needs to swap when alternating between translate and chat. Thinking mode
 *   is disabled at the call site (`think: false`) to keep translation latency
 *   in line with the previous 7B model.
 * - vision:   small VL model retained for image understanding (Qwen3.8 is
 *   text-only). Loaded on demand and swapped out when chat/translate run.
 * - analysis: high-capacity reasoning model for chat & PO assistance.
 */
export const OLLAMA_MODELS = {
  translate: process.env.OLLAMA_MODEL_TRANSLATE ?? "qwen3.8:27b-q4_K_M",
  vision: process.env.OLLAMA_MODEL_VISION ?? "qwen2.5vl:7b",
  analysis: process.env.OLLAMA_MODEL_ANALYSIS ?? "qwen3.8:27b-q4_K_M",
} as const

export type ModelRole = keyof typeof OLLAMA_MODELS

function resolveModel(role: ModelRole | string | undefined): string {
  if (!role) return OLLAMA_DEFAULT
  if (role in OLLAMA_MODELS) return OLLAMA_MODELS[role as ModelRole]
  return role
}

// Force Ollama to keep loaded models resident in VRAM. Without this, the
// model gets evicted after ~5 minutes of idleness and the next call pays a
// 10–30s cold-start penalty.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE_PER_REQUEST ?? "168h"

// Single context size for EVERY request. Ollama reloads the model whenever
// num_ctx changes between requests, so mixed sizes (translate=1024,
// chat=8192, drafts=12288) caused a 10-30s reload every time the user
// switched features even though the model itself never changed. One shared
// value keeps the resident model warm across all AI features. Sized to the
// largest consumer (PBI draft generation).
export const OLLAMA_NUM_CTX = Number(process.env.OLLAMA_NUM_CTX ?? 12288)

const JAPANESE_CHAR_RE = /[぀-ゟ゠-ヿ一-龯ｦ-ﾟ]/

export type Lang = "ja" | "id"

export function detectLang(text: string): Lang {
  return JAPANESE_CHAR_RE.test(text) ? "ja" : "id"
}

/** Options shared by every helper below. */
interface BaseCallOptions {
  numCtx?: number
  temperature?: number
  numPredict?: number
  /** Caller cancellation (e.g. `request.signal`). */
  signal?: AbortSignal
  /** Whole-call timeout; defaults to OLLAMA_TIMEOUTS.default. */
  timeoutMs?: number
  /** Short name for AI activity logs. */
  label?: string
  role?: ModelRole | string
  think?: boolean
  /** Background work: skips the priority gate and queues behind user calls. */
  background?: boolean
}

function buildBody(
  options: BaseCallOptions,
  defaults: { role: ModelRole; temperature: number },
  payload: Record<string, unknown>
): Record<string, unknown> {
  const inner: Record<string, unknown> = {
    num_ctx: options.numCtx ?? OLLAMA_NUM_CTX,
    temperature: options.temperature ?? defaults.temperature,
  }
  if (options.numPredict !== undefined) inner.num_predict = options.numPredict
  const body: Record<string, unknown> = {
    model: resolveModel(options.role ?? defaults.role),
    ...payload,
    keep_alive: KEEP_ALIVE,
    options: inner,
  }
  // `think` is only forwarded when the caller explicitly opts in; some models
  // (notably qwen3 with `think:false`) hallucinate when forced to skip the
  // reasoning chain, so we leave the model default in place by default.
  if (options.think !== undefined) body.think = options.think
  return body
}

function transport(endpoint: OllamaEndpoint, options: BaseCallOptions, body: Record<string, unknown>) {
  return {
    endpoint,
    body,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? OLLAMA_TIMEOUTS.default,
    priority: options.background ? ("background" as const) : ("user" as const),
    label: options.label ?? `ollama.${endpoint}`,
  }
}

interface GenerateChunk {
  response?: string
  done?: boolean
}

/**
 * Stream incremental tokens from Ollama's /api/generate endpoint.
 * Yields response text fragments as soon as they arrive.
 */
export async function* ollamaGenerateStream(
  prompt: string,
  options: BaseCallOptions = {}
): AsyncGenerator<string, void, unknown> {
  const body = buildBody(options, { role: "translate", temperature: 0.2 }, { prompt })
  const stream = await ollamaRequest<GenerateChunk>({ ...transport("generate", options, body), stream: true })
  for await (const json of stream) {
    if (json.response) yield json.response
    if (json.done) return
  }
}

export async function ollamaGenerate(
  prompt: string,
  options: BaseCallOptions & { system?: string } = {}
): Promise<string> {
  const payload: Record<string, unknown> = { prompt }
  if (options.system) payload.system = options.system
  const body = buildBody(options, { role: "translate", temperature: 0.2 }, payload)
  const data = await ollamaRequest<GenerateChunk>(transport("generate", options, body))
  return (data.response ?? "").trim()
}

const TRANSLATE_TO_INSTRUCTION: Record<"ja" | "id", string> = {
  id: "Translate the following text into Indonesian (Bahasa Indonesia), regardless of its source language. Never answer in English. Output only the Indonesian translation in plain text, without any prefix, quotes, explanation, or markdown.",
  ja: "Translate the following text into Japanese, regardless of its source language. Output only the Japanese translation in plain text, without any prefix, quotes, explanation, or markdown.",
}

/**
 * Source-language-agnostic translation (used by the report bilingual
 * pipeline, where legacy content may be English rather than JA/ID).
 */
export async function translateTo(
  text: string,
  target: "ja" | "id",
  signal?: AbortSignal
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ""
  const prompt = `${TRANSLATE_TO_INSTRUCTION[target]}\n\n${trimmed}`
  const out = await ollamaGenerate(prompt, { temperature: 0.2, signal, think: false, label: "translate-to" })
  return out.replace(/^["「『]|["」』]$/g, "").trim()
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  /** Set on tool-result messages so the model can pair the response with the call. */
  tool_call_id?: string
  /** Tool name on tool-result messages. */
  name?: string
  /** Tool-call requests emitted by the assistant turn. */
  tool_calls?: ToolCall[]
}

/**
 * Ollama (0.32+, qwen3.8 renderer) rejects conversations with more than one
 * system message or a system message after the first turn ("system message
 * must be at the beginning"). Callers build several system blocks for
 * readability, so fold every system message into one leading message.
 */
export function normalizeChatMessages(messages: ChatMessage[]): ChatMessage[] {
  const systemParts = messages.filter((m) => m.role === "system").map((m) => m.content)
  if (systemParts.length <= 1 && (messages.length === 0 || messages[0].role === "system" || systemParts.length === 0)) {
    return messages
  }
  const rest = messages.filter((m) => m.role !== "system")
  return [{ role: "system", content: systemParts.join("\n\n") }, ...rest]
}

export interface ToolCall {
  id?: string
  function: {
    name: string
    arguments: Record<string, unknown> | string
  }
}

export interface ChatToolDefinition {
  type: "function"
  function: {
    name: string
    description: string
    parameters: {
      type: "object"
      properties: Record<string, unknown>
      required?: string[]
    }
  }
}

export interface ChatTurnResult {
  content: string
  tool_calls: ToolCall[]
}

export type ChatStreamEvent =
  | { type: "text"; chunk: string }
  | { type: "tool_calls"; calls: ToolCall[] }
  /** Tokens Ollama actually counted in the prompt of this turn (sent once, last). */
  | { type: "usage"; promptTokens: number }

interface ChatChunk {
  message?: { content?: string; tool_calls?: ToolCall[] }
  done?: boolean
  prompt_eval_count?: number
}

interface ChatCallOptions extends BaseCallOptions {
  tools?: ChatToolDefinition[]
  format?: "json"
}

function chatBody(messages: ChatMessage[], options: ChatCallOptions, temperature: number): Record<string, unknown> {
  const payload: Record<string, unknown> = { messages: normalizeChatMessages(messages) }
  if (options.tools && options.tools.length > 0) payload.tools = options.tools
  if (options.format) payload.format = options.format
  return buildBody(options, { role: "analysis", temperature }, payload)
}

/**
 * Stream chat completion that ALSO surfaces tool_calls at the end. Yields a
 * sequence of text chunks while the model is generating, then a final
 * `tool_calls` event when the model wants to invoke tools. Use this when you
 * need the typing-style UX but also want to react to tool requests.
 */
export async function* ollamaChatStreamWithTools(
  messages: ChatMessage[],
  options: ChatCallOptions = {}
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const body = chatBody(messages, options, 0.4)
  const stream = await ollamaRequest<ChatChunk>({ ...transport("chat", options, body), stream: true })
  let pendingToolCalls: ToolCall[] = []
  for await (const json of stream) {
    const content = json.message?.content
    if (content) yield { type: "text", chunk: content }
    const calls = json.message?.tool_calls
    if (calls && calls.length > 0) pendingToolCalls = calls
    if (json.done) {
      if (json.prompt_eval_count) yield { type: "usage", promptTokens: json.prompt_eval_count }
      break
    }
  }
  if (pendingToolCalls.length > 0) yield { type: "tool_calls", calls: pendingToolCalls }
}

/**
 * Non-streaming chat that returns BOTH text content and any tool calls the
 * model produced. Used by the autonomous agent's tool loop.
 */
export async function ollamaChatTurn(
  messages: ChatMessage[],
  options: ChatCallOptions = {}
): Promise<ChatTurnResult> {
  const body = chatBody(messages, options, 0.4)
  const data = await ollamaRequest<ChatChunk>(transport("chat", options, body))
  return {
    content: data.message?.content?.trim() ?? "",
    tool_calls: data.message?.tool_calls ?? [],
  }
}

/**
 * Stream chat completion from Ollama. Yields response text chunks as they arrive.
 */
export async function* ollamaChatStream(
  messages: ChatMessage[],
  options: ChatCallOptions = {}
): AsyncGenerator<string, void, unknown> {
  const body = chatBody(messages, options, 0.4)
  const stream = await ollamaRequest<ChatChunk>({ ...transport("chat", options, body), stream: true })
  for await (const json of stream) {
    const chunk = json.message?.content
    if (chunk) yield chunk
    if (json.done) return
  }
}

/**
 * Non-streaming chat completion. Returns the full assistant message content.
 */
export async function ollamaChat(
  messages: ChatMessage[],
  options: ChatCallOptions = {}
): Promise<string> {
  const body = chatBody(messages, options, 0.3)
  const data = await ollamaRequest<ChatChunk>(transport("chat", options, body))
  return data.message?.content?.trim() ?? ""
}
