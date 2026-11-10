import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { startRepositoryBinding } from "@/services/git/repo-bindings.service"

type Params = { params: Promise<{ projectId: string }> }

/** GitStation ids (int64, positive; Kanflow sends them back exactly as GitStation listed them). */
const stationId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER)

const bodySchema = z.discriminatedUnion("intent", [
  z.object({ intent: z.literal("binding_set"), repositoryId: stationId, resolvesWorkItems: z.boolean() }).strict(),
  z.object({ intent: z.literal("binding_remove"), bindingId: stationId }).strict(),
])

/**
 * X3 結びつける / 解除する: `{ intent: "binding_set", repositoryId, resolvesWorkItems }` or
 * `{ intent: "binding_remove", bindingId }` → `{ attemptId, confirmUrl, expiresAt }`. The browser opens `confirmUrl`
 * (GitStation's confirmation) in a new window; the person presses there.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "git.bindRepository")
  if ("error" in gate) return gate.error
  try {
    const input = bodySchema.parse(await request.json())
    return jsonResponse(await startRepositoryBinding(projectId, gate.actor.userId, input), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "結びつけを始められませんでした", context: "Git repository binding start" })
  }
}
