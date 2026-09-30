import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createIceboxItemSchema } from "@/services/icebox/icebox.schemas"
import { createIceboxItem, listIcebox } from "@/services/icebox/icebox.service"

type Params = { params: Promise<{ projectId: string }> }

export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse(await listIcebox(projectId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Icebox LIST" })
  }
}

export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "icebox.write")
  if ("error" in gate) return gate.error

  try {
    const input = createIceboxItemSchema.parse(await request.json())
    return jsonResponse(await createIceboxItem(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Icebox CREATE" })
  }
}
