import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { baselineSchema } from "@/services/plan/plan.schemas"
import { clearBaseline, setBaseline } from "@/services/plan/plan.schedule"

type Params = { params: Promise<{ projectId: string }> }

/** Body { itemIds? } (omitted / empty body = whole project): planned dates → baseline. → { updated } */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const text = await request.text()
    const { itemIds } = baselineSchema.parse(text.trim() ? JSON.parse(text) : {})
    return jsonResponse(await setBaseline(projectId, itemIds, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "ベースラインの保存に失敗しました", context: "Plan baseline SET" })
  }
}

/** Clears every baseline of the project. → { updated } */
export async function DELETE(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await clearBaseline(projectId, actorFromSession(gate.session)))
  } catch (error) {
    return toHttpResponse(error, { fallback: "ベースラインの削除に失敗しました", context: "Plan baseline CLEAR" })
  }
}
