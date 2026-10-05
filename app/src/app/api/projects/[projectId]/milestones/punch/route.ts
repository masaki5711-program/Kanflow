import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createPunchSchema } from "@/services/milestones/milestones.schemas"
import { createPunch } from "@/services/milestones/milestones.punch"

type Params = { params: Promise<{ projectId: string }> }

/** Add a 残課題: any member (milestone.track). */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "milestone.track")
  if ("error" in gate) return gate.error

  try {
    const input = createPunchSchema.parse(await request.json())
    return jsonResponse(await createPunch(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Milestone punch POST" })
  }
}
