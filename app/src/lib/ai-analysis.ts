import { z } from "zod"
import { ollamaChat, ollamaChatStream, detectLang, type ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { OllamaAbortedError, OllamaError, ollamaErrorMessage, ollamaErrorResponse } from "@/lib/ollama/errors"
import { primeStream } from "@/lib/ollama/prime"
import { anySignal } from "@/lib/ollama/signals"
import { aiLog } from "@/lib/ai-monitor"

export type AILang = "ja" | "en" | "id"

/**
 * Strict per-language output rule, injected as a system message.
 * The model must produce output exclusively in the requested language.
 */
const LANG_RULES: Record<AILang, string> = {
  ja: `## 応答言語ルール（絶対遵守）
- 出力は **日本語のみ**。
- インドネシア語・英語に切り替えてはいけない。
- 固有名詞・コード・コマンド以外は日本語で書く。`,
  en: `## OUTPUT LANGUAGE RULE (STRICT)
- Output must be **English only**.
- Do not switch to Japanese or Indonesian.
- Use English for everything except proper nouns, code, and commands.`,
  id: `## ATURAN BAHASA KELUARAN (MUTLAK)
- Keluaran harus **hanya dalam Bahasa Indonesia**.
- Jangan beralih ke bahasa Jepang atau Inggris.
- Gunakan Bahasa Indonesia untuk semuanya kecuali nama diri, kode, dan perintah.`,
}

const ROLE_INTRO: Record<AILang, string> = {
  ja: "あなたは Kanflow（社内アジャイル開発管理ツール）の AI アシスタントです。ユーザーは Product Owner、Scrum Master、または開発メンバーです。情報を捏造せず、与えられたコンテキストの範囲で根拠ある提案をしてください。",
  en: "You are an AI assistant embedded in Kanflow, an in-house agile project management tool. The user is a Product Owner, Scrum Master, or developer. Do not fabricate information; ground every suggestion in the provided context.",
  id: "Anda adalah asisten AI di Kanflow, alat manajemen proyek agile internal. Pengguna adalah Product Owner, Scrum Master, atau anggota pengembang. Jangan mengarang informasi; setiap saran harus didasarkan pada konteks yang diberikan.",
}

/**
 * Normalize an unknown language hint to a supported AILang. Defaults to ja.
 */
export function normalizeLang(lang: unknown): AILang {
  if (lang === "en" || lang === "id" || lang === "ja") return lang
  return "ja"
}

/**
 * Standard system message for PO analysis features.
 * Includes language enforcement and project-aware framing.
 *
 * @param extra Per-feature instruction text. When `lang` is provided, the role
 * intro and language lock are emitted in that language so the model gets a
 * fully consistent target locale.
 */
export function buildAnalysisSystem(extra?: string, lang: AILang = "ja"): string {
  return [ROLE_INTRO[lang], LANG_RULES[lang], extra ? `\n${extra}` : ""]
    .filter(Boolean)
    .join("\n\n")
}

export interface AnalysisStreamOptions {
  temperature?: number
  numCtx?: number
  format?: "json"
  numPredict?: number
  label?: string
  /** Pass `request.signal` so a client disconnect stops generation. */
  signal?: AbortSignal
  /** Whole-call timeout; defaults to OLLAMA_TIMEOUTS.report. */
  timeoutMs?: number
}

function analysisChunks(
  messages: ChatMessage[],
  options: AnalysisStreamOptions,
  signal: AbortSignal
): AsyncGenerator<string, void, unknown> {
  return ollamaChatStream(messages, {
    role: "analysis",
    temperature: options.temperature ?? 0.3,
    // numCtx deliberately not defaulted here — ollama.ts applies the
    // shared OLLAMA_NUM_CTX so every feature keeps the model warm.
    numCtx: options.numCtx,
    signal,
    timeoutMs: options.timeoutMs ?? OLLAMA_TIMEOUTS.report,
    label: options.label ?? "analysis",
    format: options.format,
    numPredict: options.numPredict,
    // qwen3.8 has hybrid thinking mode ON by default — its reasoning
    // chain is emitted in a separate `thinking` field that our streamer
    // does not surface, so the user sees no output for tens of seconds.
    // Disabling it makes responses appear immediately.
    think: false,
  })
}

/**
 * Pull-based byte stream over text chunks. Cancelling the stream (client
 * disconnect) aborts `local`, which stops the upstream Ollama request.
 * Mid-stream failures are appended as a trailing `[error] <message>` line.
 */
function textChunksToStream(
  chunks: AsyncIterator<string>,
  local: AbortController,
  label: string
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  const t0 = Date.now()
  let chars = 0
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next()
        if (done) {
          aiLog("ANALYSIS_DONE", `${label} ${chars} chars in ${Date.now() - t0}ms`)
          controller.close()
          return
        }
        chars += value.length
        controller.enqueue(encoder.encode(value))
      } catch (err) {
        if (err instanceof OllamaAbortedError) {
          aiLog("CHAT_ABORT", `${label}: client disconnected after ${chars} chars`)
        } else {
          aiLog("CHAT_ERROR", `${label}: ${ollamaErrorMessage(err)}`)
        }
        try {
          controller.enqueue(encoder.encode(`\n\n[error] ${ollamaErrorMessage(err)}`))
          controller.close()
        } catch {
          // stream already cancelled by the client
        }
      }
    },
    cancel() {
      local.abort(new OllamaAbortedError())
      chunks.return?.().catch(() => undefined)
    },
  })
}

/**
 * Stream an analysis response as a Route Handler `Response`.
 *
 * The first chunk is awaited before responding, so failures before any
 * output (Ollama down, timeout, client gone) return a JSON error with
 * 499/408/503/502 instead of a 200 stream. Later failures are appended to
 * the text as `[error] <message>`.
 */
export async function analysisStreamResponse(
  messages: ChatMessage[],
  options: AnalysisStreamOptions = {}
): Promise<Response> {
  const label = options.label ?? "analysis"
  const local = new AbortController()
  const signal = anySignal([options.signal, local.signal])
  aiLog("ANALYSIS", `${label} started (temp=${options.temperature ?? 0.3})`)
  let chunks: AsyncIterator<string>
  try {
    chunks = await primeStream(analysisChunks(messages, options, signal))
  } catch (err) {
    aiLog(err instanceof OllamaAbortedError ? "CHAT_ABORT" : "CHAT_ERROR", `${label}: ${ollamaErrorMessage(err)}`)
    return ollamaErrorResponse(err)
  }
  return streamingResponse(textChunksToStream(chunks, local, label))
}

/**
 * Stream an analysis response as a ReadableStream of utf-8 text chunks.
 * @deprecated Use `analysisStreamResponse`, which also reports pre-stream
 * failures with a proper HTTP status.
 */
export function streamAnalysis(
  messages: ChatMessage[],
  options: AnalysisStreamOptions = {}
): ReadableStream<Uint8Array> {
  const label = options.label ?? "analysis"
  const local = new AbortController()
  const signal = anySignal([options.signal, local.signal])
  aiLog("ANALYSIS", `${label} started (temp=${options.temperature ?? 0.3})`)
  return textChunksToStream(analysisChunks(messages, options, signal), local, label)
}

export function streamingResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}

/**
 * Request a JSON-formatted response and validate it against a Zod schema.
 * Retries up to maxRetries on parse / validation failure.
 */
export async function analysisJSON<T>(
  messages: ChatMessage[],
  schema: z.ZodSchema<T>,
  options: {
    maxRetries?: number
    temperature?: number
    numCtx?: number
    signal?: AbortSignal
    timeoutMs?: number
    label?: string
  } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = await ollamaChat(messages, {
        role: "analysis",
        format: "json",
        temperature: options.temperature ?? 0.3,
        numCtx: options.numCtx,
        signal: options.signal,
        timeoutMs: options.timeoutMs ?? OLLAMA_TIMEOUTS.report,
        label: options.label ?? "analysis-json",
        think: false,
      })
      const parsed = JSON.parse(text) as unknown
      return schema.parse(parsed)
    } catch (err) {
      // Transport failures (timeout / abort / unreachable) are not fixed by
      // re-prompting; only retry malformed or invalid JSON.
      if (err instanceof OllamaError) throw err
      lastError = err
      if (attempt < maxRetries) {
        messages = [
          ...messages,
          {
            role: "system",
            content: `前の応答が JSON として不正でした。エラー: ${
              err instanceof Error ? err.message : String(err)
            }. もう一度、有効な JSON のみを返してください。`,
          },
        ]
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error("analysisJSON failed")
}

export { detectLang }
