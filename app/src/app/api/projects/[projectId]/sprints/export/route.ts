import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { searchParamsObject } from "@/services/_shared/cursor"
import { resolveExcelLang } from "@/services/excel/excel.lang"
import { xlsxResponse } from "@/services/excel/excel.shared"
import { exportSprints } from "@/services/excel/sprints.export"

type Params = { params: Promise<{ projectId: string }> }

const querySchema = z.object({ sprintId: z.string().min(1).max(191).optional(), lang: z.string().optional() })

/** `?sprintId=` (optional: one sprint, else all) `&lang=` → sprints sheet + tasks sheet. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const { sprintId } = querySchema.parse(searchParamsObject(request.url))
    const lang = await resolveExcelLang(request, gate.session.user.id)
    const { buffer, fileName } = await exportSprints(projectId, sprintId, lang)
    return xlsxResponse(buffer, fileName)
  } catch (error) {
    return toHttpResponse(error, { fallback: "エクスポートに失敗しました", context: "Sprints EXPORT" })
  }
}
