import { requireProject } from "@/lib/authz"
import { BOARD_LIMITS } from "@/lib/board/limits"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { StatusError } from "@/services/_shared/errors"
import { uploadBoardImage } from "@/services/boards/boards.service"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

/** Room for the multipart envelope around the image. */
const FORM_OVERHEAD = 64 * 1024

/**
 * Stores an image to place on the board (board.write). Multipart field `file`; PNG / JPEG / GIF / WebP only,
 * checked by content, at most BOARD_LIMITS.imageBytes. Answers the `fileId` the image element names.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  const gate = await requireProject(projectId, "board.write")
  if ("error" in gate) return gate.error

  try {
    // The form is read whole before the image is checked: a body without a declared length is refused, so a
    // chunked upload cannot make the server buffer more than the limit.
    const raw = request.headers.get("content-length")
    const declared = raw === null || raw.trim() === "" ? NaN : Number(raw)
    if (!Number.isFinite(declared)) throw new StatusError(411, "Content-Length required", {}, "PAYLOAD_TOO_LARGE")
    if (declared > BOARD_LIMITS.imageBytes + FORM_OVERHEAD) {
      throw new StatusError(413, "Image too large", { maxBytes: BOARD_LIMITS.imageBytes }, "PAYLOAD_TOO_LARGE")
    }
    const form = await request.formData()
    const file = form.get("file")
    const dto = await uploadBoardImage(projectId, boardId, file instanceof File ? file : null, actorFromSession(gate.session))
    return jsonResponse(dto, 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "画像を保存できませんでした", context: "Board image POST" })
  }
}
