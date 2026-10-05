import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createRolloutSchema } from "@/services/improvements/improvements.schemas"
import { addRollout } from "@/services/improvements/improvements.rollouts"

type Params = { params: Promise<{ projectId: string; id: string }> }

/** Add a 横展開先 (PO: release.manage). */
export async function POST(request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = createRolloutSchema.parse(await request.json())
    return jsonResponse(await addRollout(projectId, id, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "追加に失敗しました", context: "Improvement rollout POST" })
  }
}
