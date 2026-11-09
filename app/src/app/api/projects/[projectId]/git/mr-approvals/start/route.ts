import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { startMrApproval } from "@/services/git/mr-approvals.service"

type Params = { params: Promise<{ projectId: string }> }

const bodySchema = z.object({ linkId: z.string().min(1).max(64), intent: z.enum(["approve", "unapprove"]) }).strict()

/**
 * 承認する / 承認を取り消す: `{ linkId, intent }` → `{ attemptId, confirmUrl, expiresAt }`. The browser opens
 * `confirmUrl` (GitStation's confirmation) in a new window; the person presses there (plan 11 K4).
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.approve")
  if ("error" in gate) return gate.error
  try {
    const input = bodySchema.parse(await request.json())
    return jsonResponse(await startMrApproval(projectId, gate.actor.userId, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "承認を始められませんでした", context: "Git MR approval start" })
  }
}
