import { NextResponse } from "next/server"
import { z } from "zod"
import { requireAuth } from "@/lib/api-helpers"
import { bilingualizeStream, detectLang } from "@/lib/ollama"
import { aiLog, aiLogTrunc } from "@/lib/ai-monitor"

const bodySchema = z.object({
  text: z.string().min(1).max(20000),
})

/**
 * Streamed bilingual translation endpoint.
 *
 * Returns `text/plain` chunks as Ollama produces tokens so the client can
 * show the result progressively (chat-like typing effect). The full response
 * body is the final bilingual text — clients append chunks directly into the
 * target field.
 */
export async function POST(request: Request) {
  const auth = await requireAuth()
  if ("error" in auth) return auth.error

  let parsed
  try {
    const json = await request.json()
    parsed = bodySchema.parse(json)
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const ac = new AbortController()
  // qwen3:14b processes one line at a time; multi-line inputs may run for a
  // while. 3 minutes is enough headroom for typical paragraph translations.
  const timeout = setTimeout(() => ac.abort(), 180_000)

  const direction = detectLang(parsed.text) === "ja" ? "日本語→インドネシア語" : "インドネシア語→日本語"
  aiLog("TRANSLATE", `${direction} ${parsed.text.length} chars "${aiLogTrunc(parsed.text, 60)}"`)
  const t0 = Date.now()

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      let outChars = 0
      try {
        for await (const chunk of bilingualizeStream(parsed.text, ac.signal)) {
          outChars += chunk.length
          controller.enqueue(encoder.encode(chunk))
        }
        aiLog("TRANSLATE_DONE", `${direction} → ${outChars} chars in ${Date.now() - t0}ms`)
      } catch (err) {
        const message = err instanceof Error ? err.message : "translation_failed"
        aiLog("CHAT_ERROR", `translate: ${message}`)
        controller.enqueue(encoder.encode(`\n\n[error] ${message}`))
      } finally {
        clearTimeout(timeout)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}
