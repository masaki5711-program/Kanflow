import { z } from "zod"
import { ollamaChat, ollamaChatStream, detectLang, type ChatMessage } from "@/lib/ollama"
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

/**
 * Stream an analysis response. Returns a ReadableStream of utf-8 text chunks
 * suitable for returning from a Next.js Route Handler.
 */
export function streamAnalysis(
  messages: ChatMessage[],
  options: { temperature?: number; numCtx?: number; format?: "json"; numPredict?: number; label?: string } = {}
): ReadableStream<Uint8Array> {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const ac = new AbortController()
      const timeout = setTimeout(() => ac.abort(), 600_000)
      const t0 = Date.now()
      let chars = 0
      aiLog("ANALYSIS", `${options.label ?? "analysis"} started (temp=${options.temperature ?? 0.3})`)
      try {
        for await (const chunk of ollamaChatStream(messages, {
          role: "analysis",
          temperature: options.temperature ?? 0.3,
          numCtx: options.numCtx ?? 8192,
          signal: ac.signal,
          format: options.format,
          numPredict: options.numPredict,
          // qwen3.6 has hybrid thinking mode ON by default — its reasoning
          // chain is emitted in a separate `thinking` field that our streamer
          // does not surface, so the user sees no output for tens of seconds.
          // Disabling it makes responses appear immediately.
          think: false,
        })) {
          chars += chunk.length
          controller.enqueue(encoder.encode(chunk))
        }
        aiLog("ANALYSIS_DONE", `${options.label ?? "analysis"} ${chars} chars in ${Date.now() - t0}ms`)
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream_error"
        aiLog("CHAT_ERROR", `${options.label ?? "analysis"}: ${message}`)
        controller.enqueue(encoder.encode(`\n\n[error] ${message}`))
      } finally {
        clearTimeout(timeout)
        controller.close()
      }
    },
  })
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
  options: { maxRetries?: number; temperature?: number; numCtx?: number } = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 2
  let lastError: unknown
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const text = await ollamaChat(messages, {
        role: "analysis",
        format: "json",
        temperature: options.temperature ?? 0.3,
        numCtx: options.numCtx ?? 8192,
        think: false,
      })
      const parsed = JSON.parse(text) as unknown
      return schema.parse(parsed)
    } catch (err) {
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
