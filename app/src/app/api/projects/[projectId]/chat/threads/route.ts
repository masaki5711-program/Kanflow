import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { listThreadsQuerySchema } from "@/services/chat-threads/chat-threads.schemas"
import { listThreads } from "@/services/chat-threads/chat-threads.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * The caller's own chat threads in this project, most recently active first:
 * `?cursor=&limit=` → `{ items, nextCursor }`. Threads are private — nobody
 * (system admins included) can list another user's threads.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "ai.use")
  if ("error" in gate) return gate.error

  try {
    const query = listThreadsQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await listThreads({ projectId, userId: gate.actor.userId }, query))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "ChatThread LIST" })
  }
}
