import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createDependencySchema } from "@/services/plan/plan.schemas"
import { createDependency } from "@/services/plan/plan.schedule"

type Params = { params: Promise<{ projectId: string }> }

/** Body { predecessorId, successorId } (finish-to-start) → { id, predecessorId, successorId } (201). */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = createDependencySchema.parse(await request.json())
    return jsonResponse(await createDependency(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "依存関係の作成に失敗しました", context: "Plan dependency CREATE" })
  }
}
