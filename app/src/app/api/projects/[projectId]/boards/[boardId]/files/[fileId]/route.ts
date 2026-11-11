import { serveStoredFile } from "@/lib/api-helpers"
import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { getBoardImage } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string; fileId: string }> }

/** The bytes of one image of a live board (board.read), with its checked type and `nosniff`. */
export async function GET(request: Request, { params }: Params) {
  const { projectId, boardId, fileId } = await params
  const gate = await requireProject(projectId, "board.read")
  if ("error" in gate) return gate.error

  try {
    const image = await getBoardImage(projectId, boardId, fileId)
    return await serveStoredFile(projectId, image.fileName, image.mimeType, image.fileName, request, false)
  } catch (error) {
    return toHttpResponse(error, { fallback: "画像を取得できませんでした", context: "Board image GET" })
  }
}
