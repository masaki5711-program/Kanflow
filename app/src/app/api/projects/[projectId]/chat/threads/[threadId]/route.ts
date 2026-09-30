import { requireProject } from "@/lib/authz"
import { jsonResponse, successResponse, toHttpResponse } from "@/services/_shared"
import { renameThreadSchema, threadIdSchema } from "@/services/chat-threads/chat-threads.schemas"
import { deleteThread, getThread, renameThread } from "@/services/chat-threads/chat-threads.service"

type Params = { params: Promise<{ projectId: string; threadId: string }> }

/*
 * One chat thread of the caller. Every handler answers 404 for a thread that
 * belongs to someone else, another project, or was deleted (owner only; no
 * admin override).
 */

/** `{ thread, messages }` — the newest 200 messages, oldest first. */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, threadId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await getThread({ projectId, userId: gate.actor.userId }, threadIdSchema.parse(threadId)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "ChatThread GET" })
  }
}

/** `{ title }` → the renamed thread. */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId, threadId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error
  try {
    const { title } = renameThreadSchema.parse(await request.json())
    return jsonResponse(await renameThread({ projectId, userId: gate.actor.userId }, threadIdSchema.parse(threadId), title))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "ChatThread RENAME" })
  }
}

/** Soft delete (purged by the worker after 30 days). */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId, threadId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error
  try {
    await deleteThread({ projectId, userId: gate.actor.userId }, threadIdSchema.parse(threadId))
    return successResponse()
  } catch (error) {
    return toHttpResponse(error, { fallback: "削除に失敗しました", context: "ChatThread DELETE" })
  }
}
