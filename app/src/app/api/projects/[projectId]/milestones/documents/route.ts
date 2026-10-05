import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createDocumentSchema } from "@/services/milestones/milestones.schemas"
import { createDocument } from "@/services/milestones/milestones.documents"

type Params = { params: Promise<{ projectId: string }> }

/** Add a 引き渡し資料 (plan.write). */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "plan.write")
  if ("error" in gate) return gate.error

  try {
    const input = createDocumentSchema.parse(await request.json())
    return jsonResponse(await createDocument(projectId, input, actorFromSession(gate.session)), 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "作成に失敗しました", context: "Milestone document POST" })
  }
}
