import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { attributesSchema } from "@/services/plan-actuals/actuals.schemas"
import { listAttributes, replaceAttributes } from "@/services/plan-actuals/attributes.service"

type Params = { params: Promise<{ projectId: string }> }

/** 設備・工程・タグ of the project. → { attributes, canEdit } */
export async function GET(_request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    return jsonResponse({ attributes: await listAttributes(projectId), canEdit: can(gate.actor, "project.update") })
  } catch (error) {
    return toHttpResponse(error, { fallback: "属性の取得に失敗しました", context: "Project attributes GET" })
  }
}

/** Body { attributes: [{ kind, ref }] } (replaces all, at most 50). → { attributes } */
export async function PUT(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.update")
  if ("error" in gate) return gate.error

  try {
    const input = attributesSchema.parse(await request.json())
    return jsonResponse({ attributes: await replaceAttributes(projectId, input, actorFromSession(gate.session)) })
  } catch (error) {
    return toHttpResponse(error, { fallback: "属性の保存に失敗しました", context: "Project attributes PUT" })
  }
}
