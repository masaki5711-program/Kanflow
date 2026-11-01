import type { Session } from "next-auth"
import { z } from "zod"
import type { FeedbackViewer } from "@/services/feedback/feedback.access"

/** Session twin of /api/v1/feedback/* for the Lessons screen (W11): the signed-in user is the viewer. */

export function viewerFromSession(session: Session): FeedbackViewer {
  return { userId: session.user.id, systemRole: session.user.role ?? "member", projectIds: null }
}

export const idParam = z.string().trim().min(1).max(191)

/** The JSON body of a POST; an empty body is `{}`. Throws a SyntaxError on malformed JSON (mapped to 400 by the route). */
export async function readBody(request: Request): Promise<unknown> {
  const text = await request.text()
  return text.trim() ? (JSON.parse(text) as unknown) : {}
}
