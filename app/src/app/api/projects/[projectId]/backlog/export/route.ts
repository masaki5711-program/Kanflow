import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { exportBacklog } from "@/services/excel/backlog.export"
import { parseBacklogExportFilters } from "@/services/excel/backlog.export-filters"
import { resolveExcelLang } from "@/services/excel/excel.lang"
import { xlsxResponse } from "@/services/excel/excel.shared"

type Params = { params: Promise<{ projectId: string }> }

/**
 * `?lang=ja|en|id` (sheet / header language; default: the user's) → backlog-<project>-<date>.xlsx.
 * The backlog page's filters (`?q ?status ?goal ?epic ?points ?po ?plan`) narrow the rows.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const lang = await resolveExcelLang(request, gate.session.user.id)
    const filters = parseBacklogExportFilters(new URL(request.url).searchParams)
    const { buffer, fileName } = await exportBacklog(projectId, lang, filters)
    return xlsxResponse(buffer, fileName)
  } catch (error) {
    return toHttpResponse(error, { fallback: "エクスポートに失敗しました", context: "Backlog EXPORT" })
  }
}
