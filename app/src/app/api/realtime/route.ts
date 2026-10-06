import { NextResponse } from "next/server"
import { auth } from "@/lib/auth"
import { accessVia, can, isProjectLive, loadProjectActor, unauthorizedResponse } from "@/lib/authz"
import { logger } from "@/lib/logger"
import { openRealtimeStream, SSE_HEADERS } from "@/lib/realtime/sse"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const log = logger.child({ module: "realtime-route" })

/** cuid-like ids only; anything else is ignored rather than looked up. */
const PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

/**
 * The project whose events the stream may carry: requested AND viewable
 * (`project.view`, live project). Refusal is silent — the stream still
 * carries the user's own events (bell) and `ready` reports `projectId: null`.
 */
async function viewableProject(requested: string | null, userId: string, systemRole: string): Promise<string | null> {
  if (!requested || !PROJECT_ID_PATTERN.test(requested)) return null
  try {
    const [live, actor] = await Promise.all([isProjectLive(requested), loadProjectActor(userId, systemRole, requested)])
    return live && accessVia(actor) && can(actor, "project.view") ? requested : null
  } catch (error) {
    log.warn("realtime project check failed", { projectId: requested, error: error instanceof Error ? error.message : String(error) })
    return null
  }
}

/**
 * GET /api/realtime?projectId=<optional> — Server-Sent Events of real-time
 * update events (ids only; clients refetch through the authorized APIs).
 * 401 without a session, 429 when the user has too many streams open.
 */
export async function GET(request: Request) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return unauthorizedResponse()

  const requested = new URL(request.url).searchParams.get("projectId")
  const projectId = await viewableProject(requested, userId, session.user.role ?? "member")
  const stream = openRealtimeStream({ userId, projectId }, request.signal)
  if (!stream) {
    return NextResponse.json({ error: "Too many open connections", code: "RATE_LIMITED" }, { status: 429 })
  }
  return new Response(stream, { headers: SSE_HEADERS })
}
