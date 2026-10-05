import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createCheckSchema } from "@/services/improvements/improvements.schemas"
import { addCustomCheck } from "@/services/improvements/improvements.checks"

type Params = { params: Promise<{ projectId: string; id: string }> }

/** A custom 定着確認 date (PO: release.manage). The 1 / 3 month checks come from the 展開日. */
export async function POST(request: Request, { params }: Params) {
  const { projectId, id } = await params
  const gate = await requireProject(projectId, "release.manage")
  if ("error" in gate) return gate.error

  try {
    const input = createCheckSchema.parse(await request.json())
    return jsonResponse(await addCustomCheck(projectId, id, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "追加に失敗しました", context: "Improvement check POST" })
  }
}
