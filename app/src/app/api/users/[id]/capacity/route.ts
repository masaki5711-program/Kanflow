import { requireUserCapacityManager } from "@/lib/authz/require-user-capacity"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { capacityCreateSchema } from "@/services/plan-leveling/capacity.schemas"
import { createUserCapacity, listUserCapacity } from "@/services/plan-leveling/capacity.service"

type Params = { params: Promise<{ id: string }> }

/** A person's own FTE periods (the person, their section manager, admins). → { capacities } */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireUserCapacityManager(id)
  if ("error" in gate) return gate.error
  try {
    return jsonResponse({ capacities: await listUserCapacity(id) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の取得に失敗しました", context: "User capacity LIST" })
  }
}

/** Body { from, to?, fte } → the new period (201). 409 CAPACITY_OVERLAP. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params
  const gate = await requireUserCapacityManager(id)
  if ("error" in gate) return gate.error
  try {
    const input = capacityCreateSchema.parse(await request.json())
    return jsonResponse(await createUserCapacity(id, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "稼働量の保存に失敗しました", context: "User capacity CREATE" })
  }
}
