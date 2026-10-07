import { requireProject } from "@/lib/authz"
import { consumeRateLimit, REACTION_RATE_LIMIT } from "@/lib/rate-limit"
import { actorFromSession, errorResponse, jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { reactionsQuerySchema, toggleReactionSchema } from "@/services/reactions/reactions.schemas"
import { getReactions, toggleReaction } from "@/services/reactions/reactions.service"

type Params = { params: Promise<{ projectId: string }> }

/** `?targetType=comment|team_message|task_completion&ids=a,b,c` (≤ 200) → `{ reactions: { [id]: [{ emoji, count, mine, users }] } }`. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const query = reactionsQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse({ reactions: await getReactions(projectId, query, gate.actor.userId) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Reaction LIST" })
  }
}

/** `{ targetType, targetId, emoji }` → `{ active, reactions }`: adds the viewer's reaction, or takes it back. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "comment.write")
  if ("error" in gate) return gate.error
  const retryAfter = consumeRateLimit("reactions", REACTION_RATE_LIMIT, gate.actor.userId)
  if (retryAfter) return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfter } })

  try {
    const input = toggleReactionSchema.parse(await request.json())
    return jsonResponse(await toggleReaction(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Reaction TOGGLE" })
  }
}
