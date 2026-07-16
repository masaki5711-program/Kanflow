const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? "http://127.0.0.1:11434"

// Default fallback for legacy callers that don't specify a model.
const OLLAMA_DEFAULT = process.env.OLLAMA_MODEL ?? "qwen3.6:27b-q4_K_M"

/**
 * Purpose-specific model selection. Each role can be overridden by env var.
 * - translate: same large reasoning model as analysis so the two roles share
 *   a single resident model — `OLLAMA_MAX_LOADED_MODELS=1` therefore never
 *   needs to swap when alternating between translate and chat. Thinking mode
 *   is disabled at the call site (`think: false`) to keep translation latency
 *   in line with the previous 7B model.
 * - vision:   small VL model retained for image understanding (Qwen3.6 is
 *   text-only). Loaded on demand and swapped out when chat/translate run.
 * - analysis: high-capacity reasoning model for chat & PO assistance.
 */
export const OLLAMA_MODELS = {
  translate: process.env.OLLAMA_MODEL_TRANSLATE ?? "qwen3.6:27b-q4_K_M",
  vision: process.env.OLLAMA_MODEL_VISION ?? "qwen2.5vl:7b",
  analysis: process.env.OLLAMA_MODEL_ANALYSIS ?? "qwen3.6:27b-q4_K_M",
} as const

export type ModelRole = keyof typeof OLLAMA_MODELS

function resolveModel(role: ModelRole | string | undefined): string {
  if (!role) return OLLAMA_DEFAULT
  if (role in OLLAMA_MODELS) return OLLAMA_MODELS[role as ModelRole]
  return role
}

const JAPANESE_CHAR_RE = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF\uFF66-\uFF9F]/

export type Lang = "ja" | "id"

export function detectLang(text: string): Lang {
  return JAPANESE_CHAR_RE.test(text) ? "ja" : "id"
}

interface OllamaGenerateResponse {
  response: string
  done: boolean
}

/**
 * Stream incremental tokens from Ollama's /api/generate endpoint.
 * Yields response text fragments as soon as they arrive.
 */
export async function* ollamaGenerateStream(
  prompt: string,
  options: { numCtx?: number; temperature?: number; signal?: AbortSignal; role?: ModelRole | string; think?: boolean } = {}
): AsyncGenerator<string, void, unknown> {
  const url = `${OLLAMA_BASE_URL}/api/generate`
  const body: Record<string, unknown> = {
    model: resolveModel(options.role ?? "translate"),
    prompt,
    stream: true,
    keep_alive: KEEP_ALIVE,
    options: {
      num_ctx: options.numCtx ?? 1024,
      temperature: options.temperature ?? 0.2,
    },
  }
  if (options.think !== undefined) body.think = options.think

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "")
    throw new Error(`Ollama generate stream error (${res.status}): ${err}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const json = JSON.parse(trimmed) as { response?: string; done?: boolean }
        if (json.response) yield json.response
        if (json.done) return
      } catch {
        // ignore malformed line
      }
    }
  }
}

// Force Ollama to keep loaded models resident in VRAM. Without this, the
// model gets evicted after ~5 minutes of idleness and the next call pays a
// 10–30s cold-start penalty.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE_PER_REQUEST ?? "168h"

export async function ollamaGenerate(
  prompt: string,
  options: { numCtx?: number; temperature?: number; signal?: AbortSignal; role?: ModelRole | string; think?: boolean } = {}
): Promise<string> {
  const url = `${OLLAMA_BASE_URL}/api/generate`
  // `think` is only forwarded when the caller explicitly opts in; some models
  // (notably qwen3 with `think:false`) hallucinate when forced to skip the
  // reasoning chain, so we leave the model default in place by default.
  const body: Record<string, unknown> = {
    model: resolveModel(options.role ?? "translate"),
    prompt,
    stream: false,
    keep_alive: KEEP_ALIVE,
    options: {
      num_ctx: options.numCtx ?? 4096,
      temperature: options.temperature ?? 0.2,
    },
  }
  if (options.think !== undefined) body.think = options.think

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  })

  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(`Ollama API error (${res.status}): ${err}`)
  }

  const data = (await res.json()) as OllamaGenerateResponse
  return data.response.trim()
}

const TRANSLATE_INSTRUCTION: Record<"ja2id" | "id2ja", string> = {
  ja2id:
    "Translate the following Japanese text into Indonesian. Output only the translation in plain text, without any prefix, quotes, explanation, or markdown.",
  id2ja:
    "Translate the following Indonesian text into Japanese. Output only the translation in plain text, without any prefix, quotes, explanation, or markdown.",
}

export async function translate(
  text: string,
  direction: "ja2id" | "id2ja",
  signal?: AbortSignal
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed) return ""

  const prompt = `${TRANSLATE_INSTRUCTION[direction]}\n\n${trimmed}`
  // Disable thinking mode — qwen3.6 otherwise spends seconds emitting reasoning
  // tokens that never reach the user.
  const out = await ollamaGenerate(prompt, { temperature: 0.2, numCtx: 1024, signal, think: false })
  return out.replace(/^["「『]|["」』]$/g, "").trim()
}

/**
 * Bilingual rendering of `text`. Multi-line input is split on newlines and each
 * non-empty line is translated in parallel; the result interleaves ID and JA
 * for every original line so the user can compare line-by-line.
 *
 * Returns:
 * - ja:        all Japanese lines joined with the original line breaks
 * - id:        all Indonesian lines joined with the original line breaks
 * - bilingual: pre-formatted output with each line shown as ID then JA,
 *              one blank line between pairs (use this in UI as-is)
 * - sourceLang: language of the original input (best-effort)
 */
export async function bilingualize(
  text: string,
  signal?: AbortSignal
): Promise<{ ja: string; id: string; bilingual: string; sourceLang: Lang }> {
  const trimmed = text.trim()
  if (!trimmed) return { ja: "", id: "", bilingual: "", sourceLang: "ja" }

  const sourceLang = detectLang(trimmed)
  // Split on line breaks. Preserve blank lines as paragraph separators.
  const lines = text.split(/\r?\n/)

  // Translate non-blank lines with limited concurrency. Running every line in
  // parallel would saturate the GPU when using the larger Qwen3 model and lead
  // to per-request timeouts; capping concurrency matches the configured
  // OLLAMA_NUM_PARALLEL slot count.
  const direction: "ja2id" | "id2ja" = sourceLang === "ja" ? "ja2id" : "id2ja"
  const CONCURRENCY = Math.max(1, Number(process.env.OLLAMA_NUM_PARALLEL) || 3)
  const translatedLines: string[] = new Array(lines.length).fill("")
  let next = 0
  async function worker() {
    while (true) {
      const i = next++
      if (i >= lines.length) return
      const line = lines[i]
      if (!line.trim()) continue
      translatedLines[i] = await translate(line, direction, signal)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, lines.length) }, () => worker())
  )

  // Build the per-line "ID first, JA below, blank line between pairs" output.
  const pairs: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const original = lines[i]
    const translatedLine = translatedLines[i]
    if (!original.trim() && !translatedLine.trim()) {
      // Preserve the user's intentional blank lines as a single blank between pairs.
      pairs.push("")
      continue
    }
    if (sourceLang === "ja") {
      pairs.push(translatedLine)
      pairs.push(original)
    } else {
      pairs.push(original)
      pairs.push(translatedLine)
    }
    pairs.push("") // blank line between pairs
  }
  // Trim trailing blank
  while (pairs.length && pairs[pairs.length - 1] === "") pairs.pop()
  const bilingual = pairs.join("\n")

  // Aggregate ja / id for backward compatibility.
  const jaJoined = sourceLang === "ja"
    ? text
    : lines.map((l, i) => (l.trim() ? translatedLines[i] : l)).join("\n")
  const idJoined = sourceLang === "id"
    ? text
    : lines.map((l, i) => (l.trim() ? translatedLines[i] : l)).join("\n")

  return { ja: jaJoined, id: idJoined, bilingual, sourceLang }
}

/**
 * Stream the bilingual rendering of `text`. Lines are processed sequentially
 * so the consumer gets a stable, in-order text feed (no out-of-order tokens).
 * Output format mirrors `bilingualize.bilingual`:
 *   ID line 1
 *   JA line 1
 *
 *   ID line 2
 *   JA line 2
 */
export async function* bilingualizeStream(
  text: string,
  signal?: AbortSignal
): AsyncGenerator<string, void, unknown> {
  const trimmed = text.trim()
  if (!trimmed) return

  const sourceLang = detectLang(trimmed)
  const direction: "ja2id" | "id2ja" = sourceLang === "ja" ? "ja2id" : "id2ja"
  const lines = text.split(/\r?\n/)

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const isLast = i === lines.length - 1
    if (!line.trim()) {
      // Preserve user's blank line as a single newline in the output.
      yield "\n"
      continue
    }
    const prompt = `${TRANSLATE_INSTRUCTION[direction]}\n\n${line}`
    if (sourceLang === "ja") {
      // Stream the ID translation first, then echo the JA original below.
      for await (const chunk of ollamaGenerateStream(prompt, { temperature: 0.2, numCtx: 1024, signal, think: false })) {
        yield chunk
      }
      yield `\n${line}`
    } else {
      // Source is ID — emit the original first, then stream the JA translation.
      yield `${line}\n`
      for await (const chunk of ollamaGenerateStream(prompt, { temperature: 0.2, numCtx: 1024, signal, think: false })) {
        yield chunk
      }
    }
    if (!isLast) yield "\n\n"
  }
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

/**
 * Stream chat completion that ALSO surfaces tool_calls at the end. Yields a
 * sequence of text chunks while the model is generating, then a final
 * `tool_calls` event when the model wants to invoke tools. Use this when you
 * need the typing-style UX but also want to react to tool requests.
 */
export async function* ollamaChatStreamWithTools(
  messages: ChatMessage[],
  options: {
    numCtx?: number
    temperature?: number
    signal?: AbortSignal
    role?: ModelRole | string
    think?: boolean
    numPredict?: number
    tools?: ChatToolDefinition[]
  } = {}
): AsyncGenerator<ChatStreamEvent, void, unknown> {
  const url = `${OLLAMA_BASE_URL}/api/chat`
  const innerOptions: Record<string, unknown> = {
    num_ctx: options.numCtx ?? 8192,
    temperature: options.temperature ?? 0.4,
  }
  if (options.numPredict !== undefined) innerOptions.num_predict = options.numPredict
  const body: Record<string, unknown> = {
    model: resolveModel(options.role ?? "analysis"),
    messages,
    stream: true,
    keep_alive: KEEP_ALIVE,
    options: innerOptions,
  }
  if (options.think !== undefined) body.think = options.think
  if (options.tools && options.tools.length > 0) body.tools = options.tools

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "")
    throw new Error(`Ollama chat error (${res.status}): ${err}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let pendingToolCalls: ToolCall[] = []
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const json = JSON.parse(trimmed) as {
          message?: { content?: string; tool_calls?: ToolCall[] }
          done?: boolean
        }
        const content = json.message?.content
        if (content) yield { type: "text", chunk: content }
        const calls = json.message?.tool_calls
        if (calls && calls.length > 0) pendingToolCalls = calls
        if (json.done) {
          if (pendingToolCalls.length > 0) {
            yield { type: "tool_calls", calls: pendingToolCalls }
          }
          return
        }
      } catch {
        // ignore malformed line
      }
    }
  }
}

/**
 * Non-streaming chat that returns BOTH text content and any tool calls the
 * model produced. Used by the chat route's tool-loop before switching to
 * `ollamaChatStream` for the final user-facing response.
 */
export async function ollamaChatTurn(
  messages: ChatMessage[],
  options: {
    numCtx?: number
    temperature?: number
    signal?: AbortSignal
    role?: ModelRole | string
    think?: boolean
    numPredict?: number
    tools?: ChatToolDefinition[]
  } = {}
): Promise<ChatTurnResult> {
  const url = `${OLLAMA_BASE_URL}/api/chat`
  const innerOptions: Record<string, unknown> = {
    num_ctx: options.numCtx ?? 8192,
    temperature: options.temperature ?? 0.4,
  }
  if (options.numPredict !== undefined) innerOptions.num_predict = options.numPredict
  const body: Record<string, unknown> = {
    model: resolveModel(options.role ?? "analysis"),
    messages,
    stream: false,
    keep_alive: KEEP_ALIVE,
    options: innerOptions,
  }
  if (options.think !== undefined) body.think = options.think
  if (options.tools && options.tools.length > 0) body.tools = options.tools

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(`Ollama chat error (${res.status}): ${err}`)
  }
  const data = (await res.json()) as {
    message?: { content?: string; tool_calls?: ToolCall[] }
  }
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
  options: { numCtx?: number; temperature?: number; signal?: AbortSignal; role?: ModelRole | string; think?: boolean; format?: "json"; numPredict?: number } = {}
): AsyncGenerator<string, void, unknown> {
  const url = `${OLLAMA_BASE_URL}/api/chat`
  const innerOptions: Record<string, unknown> = {
    num_ctx: options.numCtx ?? 8192,
    temperature: options.temperature ?? 0.4,
  }
  if (options.numPredict !== undefined) innerOptions.num_predict = options.numPredict
  const body: Record<string, unknown> = {
    model: resolveModel(options.role ?? "analysis"),
    messages,
    stream: true,
    keep_alive: KEEP_ALIVE,
    options: innerOptions,
  }
  if (options.think !== undefined) body.think = options.think
  if (options.format) body.format = options.format

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  })

  if (!res.ok || !res.body) {
    const err = await res.text().catch(() => "")
    throw new Error(`Ollama chat error (${res.status}): ${err}`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split("\n")
    buffer = lines.pop() ?? ""
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const json = JSON.parse(trimmed) as { message?: { content?: string }; done?: boolean }
        const chunk = json.message?.content
        if (chunk) yield chunk
        if (json.done) return
      } catch {
        // ignore malformed line
      }
    }
  }
}

/**
 * Non-streaming chat completion. Returns the full assistant message content.
 */
export async function ollamaChat(
  messages: ChatMessage[],
  options: { numCtx?: number; temperature?: number; signal?: AbortSignal; role?: ModelRole | string; format?: "json"; think?: boolean } = {}
): Promise<string> {
  const url = `${OLLAMA_BASE_URL}/api/chat`
  const body: Record<string, unknown> = {
    model: resolveModel(options.role ?? "analysis"),
    messages,
    stream: false,
    keep_alive: KEEP_ALIVE,
    options: {
      num_ctx: options.numCtx ?? 8192,
      temperature: options.temperature ?? 0.3,
    },
  }
  if (options.think !== undefined) body.think = options.think
  if (options.format) body.format = options.format

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: options.signal,
  })
  if (!res.ok) {
    const err = await res.text().catch(() => "")
    throw new Error(`Ollama chat error (${res.status}): ${err}`)
  }
  const data = (await res.json()) as { message?: { content?: string } }
  return data.message?.content?.trim() ?? ""
}
