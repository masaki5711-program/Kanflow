import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createCheckSchema } from "@/services/milestones/milestones.schemas"
import { createCheck } from "@/services/milestones/milestones.checks"

type Params = { params: Promise<{ projectId: string }> }

/** Add a チェック項目 (plan.write). */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = createCheckSchema.parse(await request.json())
    return jsonResponse(await createCheck(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Milestone check POST" })
  }
}
