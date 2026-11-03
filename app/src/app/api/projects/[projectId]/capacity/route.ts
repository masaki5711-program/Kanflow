import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { allocationCreateSchema } from "@/services/plan-leveling/capacity.schemas"
import { createAllocation, listProjectAllocations } from "@/services/plan-leveling/capacity.service"

type Params = { params: Promise<{ projectId: string }> }

/** Members and their allocations to this project (capacity.manage: PO / SM). → { members, allocations } */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "capacity.manage")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse(await listProjectAllocations(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の取得に失敗しました", context: "Project capacity LIST" })
  }
}

/** Body { userId, from, to?, fte } — a member's allocation to THIS project → the row (201). 400 CAPACITY_NOT_MEMBER. */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "capacity.manage")
  if ("error" in gate) return gate.error
  try {
    const input = allocationCreateSchema.parse(await request.json())
    return jsonResponse(await createAllocation(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の保存に失敗しました", context: "Project capacity CREATE" })
  }
}
