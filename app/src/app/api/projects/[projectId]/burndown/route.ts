import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { jsonResponse, toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { getBurndown } from "@/services/sprints/sprints.service"

/** `?sprintId=` (optional) narrows the burndown to one sprint. */
const burndownQuerySchema = z.object({ sprintId: z.string().min(1).max(191).optional() })

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const { sprintId } = burndownQuerySchema.parse(searchParamsObject(request.url))
    return jsonResponse(await getBurndown(projectId, sprintId))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取得に失敗しました", context: "Burndown" })
  }
}
