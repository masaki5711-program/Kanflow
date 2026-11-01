import { can, requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { createAcceptanceCriterionSchema } from "@/services/acceptance-criteria/acceptance-criteria.schemas"
import { createAcceptanceCriterion, listAcceptanceCriteria } from "@/services/acceptance-criteria/acceptance-criteria.service"

type Params = { params: Promise<{ projectId: string; itemId: string }> }

/**
 * The PBI's 受入基準 items (PBI-12/AC-2) for the PBI screen, `seq` order, any project viewer.
 * `canEdit` = backlog.write (PO / SM / admin): the checklist shows its add / edit / delete controls.
 */
export async function GET(_request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error
  try {
    return jsonResponse({ ...(await listAcceptanceCriteria(projectId, itemId)), canEdit: can(gate.actor, "backlog.write") })
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Acceptance criteria GET" })
  }
}

/** Add a criterion (backlog.write: PO / SM; admins always pass). 201 `{ data }`. */
export async function POST(request: Request, { params }: Params) {
  const { projectId, itemId } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error
  try {
    const input = createAcceptanceCriterionSchema.parse(await request.json())
    return jsonResponse({ data: await createAcceptanceCriterion(projectId, itemId, input, actorFromSession(gate.session)) }, 201)
  } catch (error) {
    return toHttpResponse(error, { fallback: "追加に失敗しました", context: "Acceptance criteria POST" })
  }
}
