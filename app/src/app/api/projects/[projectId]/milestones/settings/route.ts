import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { updateSettingsSchema } from "@/services/milestones/milestones.schemas"
import { updateSettings } from "@/services/milestones/milestones.service"

type Params = { params: Promise<{ projectId: string }> }

/** Check 呼び名 and the 予算 / 推移 switches (plan.write). */
export async function PATCH(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = updateSettingsSchema.parse(await request.json())
    return jsonResponse(await updateSettings(projectId, input, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "更新に失敗しました", context: "Milestone settings PATCH" })
  }
}
