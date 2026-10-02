import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { StatusError, ValidationError } from "@/services/_shared/errors"
import { TEAM_CHAT_MAX_TOTAL_BYTES } from "@/lib/team-chat-limits"

/** Body ceiling checked from Content-Length before the multipart body is read (files + text + framing). */
const MAX_REQUEST_BYTES = TEAM_CHAT_MAX_TOTAL_BYTES + 1024 * 1024
import { createMessage, listMessages } from "@/services/team-chat/team-chat.service"

type Params = { params: Promise<{ projectId: string }> }

function parseTime(raw: string | null): Date | undefined {
  if (!raw) return undefined
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) throw new ValidationError("Invalid time", {}, "VALIDATION")
  return d
}

/** Oldest first: `?before=ISO` (older page) or `?after=ISO` (poll) and `?forMe=1` → `{ items, hasMore }`. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const sp = new URL(request.url).searchParams
    const viewer = { userId: gate.actor.userId, canModerate: can(gate.actor, "comment.moderate") }
    return jsonResponse(await listMessages(projectId, viewer, { before: parseTime(sp.get("before")), after: parseTime(sp.get("after")), forMe: sp.get("forMe") === "1" }))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Team chat LIST" })
  }
}

/** multipart: `body`, optional `replyToId`, `files` (≤ 5, ≤ 20 MB each) → 201 message. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "comment.write")
  if ("error" in gate) return gate.error

  try {
    const length = Number(request.headers.get("content-length") ?? "0")
    if (length > MAX_REQUEST_BYTES) {
      throw new StatusError(413, "添付ファイルの合計が大きすぎます（合計 50MB まで）", {}, "TEAM_CHAT_FILE_TOO_LARGE")
    }
    const form = await request.formData()
    const body = typeof form.get("body") === "string" ? (form.get("body") as string) : ""
    const replyRaw = form.get("replyToId")
    const replyToId = typeof replyRaw === "string" && replyRaw ? replyRaw.slice(0, 191) : null
    const files = form.getAll("files").filter((f): f is File => typeof f === "object" && f !== null && "size" in f)
    const actor = actorFromSession(gate.session)
    return jsonResponse(await createMessage(projectId, { body, replyToId, files }, actor, can(gate.actor, "comment.moderate")), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "送信に失敗しました", context: "Team chat CREATE" })
  }
}
