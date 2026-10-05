import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { tickConditionSchema } from "@/services/milestones/milestones.schemas"
import { tickCondition } from "@/services/milestones/milestones.service"

type Params = { params: Promise<{ projectId: string; planItemId: string }> }

/** Tick / untick one 完了条件 of a stage: any member (milestone.track). */
export async function PUT(request: Request, { params }: Params) {
  const { projectId, planItemId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const input = tickConditionSchema.parse(await request.json())
    return jsonResponse(await tickCondition(projectId, planItemId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone checklist PUT" })
  }
}
