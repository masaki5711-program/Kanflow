import { requireProject } from "@/lib/authz"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { OllamaError, ollamaErrorResponse } from "@/lib/ollama/errors"
import { errorResponse, jsonResponse, toHttpResponse } from "@/services/_shared"
import { aiAssist } from "@/services/boards/boards.collab"
import { aiAssistSchema } from "@/services/boards/boards.collab.schemas"
import { readBoundedJson } from "@/services/boards/boards.http"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/**
 * Summarizes or groups the selected sticky notes with the local LLM (Ollama), when the person asks (board.write).
 * Only the texts sent here go to the model, and only to the local one.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error
  // The local model is shared (translation, chat, other apps): a few requests per person and minute.
  const { allowed, status } = getRateLimiter("board-ai", { limit: 6, windowMs: 60_000 }).consume(gate.session.user.id)
  if (!allowed) return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfterSeconds(status) } })
  try {
    const input = aiAssistSchema.parse(await readBoundedJson(request, 128 * 1024))
    return jsonResponse(await aiAssist(projectId, boardId, input, request.signal))
  } catch (error) {
    if (error instanceof OllamaError) return ollamaErrorResponse(error)
    return toHttpResponse(error, { fallback: "AI の処理に失敗しました", context: "Board AI POST" })
  }
}
