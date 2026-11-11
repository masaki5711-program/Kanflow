import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createBoardSchema } from "@/services/boards/boards.schemas"
import { createBoard, listBoards } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string }> }

/**
 * ボード of a project (docs/plan/10-board.md). GET lists the live boards (board.read) or, with
 * `?trashed=1`, the ones in the trash (board.manage); `permissions` are UI hints only.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const trashed = new URL(request.url).searchParams.get("trashed") === "1"
  const gate = await requireProject(projectId, trashed ? "board.manage" : "board.read")
  if ("error" in gate) return gate.error

  try {
    const list = await listBoards(projectId, { trashed })
    const permissions = { canWrite: can(gate.actor, "board.write"), canManage: can(gate.actor, "board.manage") }
    return jsonResponse({ ...list, permissions })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Boards GET" })
  }
}

/** Create a board with its first sheet (board.write). */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    const input = createBoardSchema.parse(await request.json())
    return jsonResponse(await createBoard(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Boards POST" })
  }
}
