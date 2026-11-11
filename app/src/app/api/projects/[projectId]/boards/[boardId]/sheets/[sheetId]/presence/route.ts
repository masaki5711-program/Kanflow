import { requireProject } from "@/lib/authz"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { actorFromSession, errorResponse, jsonResponse, toHttpResponse } from "@/services/_shared"
import { heartbeat, leave } from "@/services/boards/boards.collab"
import { presenceSchema } from "@/services/boards/boards.collab.schemas"
import { readBoundedJson } from "@/services/boards/boards.http"

type Params = { params: Promise<{ projectId: string; boardId: string; sheetId: string }> }

/** I have the sheet open, with this selected (board.read): answers who else has it open now (ids and names only). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error
  // An open sheet says so every 5 s (12 a minute; a few tabs fit): more per person is refused, and a refused call
  // does not count, so a person is never locked out by retrying. Keyed by the person only (no id from the URL).
  const { allowed, status } = getRateLimiter("board-presence", { limit: 60, windowMs: 60_000 }).consume(gate.session.user.id)
  if (!allowed) return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfterSeconds(status) } })
  try {
    const input = presenceSchema.parse(await readBoundedJson(request, 8 * 1024))
    return jsonResponse(await heartbeat(projectId, boardId, sheetId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Board presence POST" })
  }
}

/** I closed the sheet (board.read). */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, boardId, sheetId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error
  try {
    await leave(projectId, boardId, sheetId, actorFromSession(gate.session))
    return new Response(null, { status: 204 })
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Board presence DELETE" })
  }
}
