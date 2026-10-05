import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { resolveExcelLang } from "@/services/excel/excel.lang"
import { xlsxResponse } from "@/services/excel/excel.shared"
import { exportMilestoneBoard } from "@/services/excel/milestone.export"

type Params = { params: Promise<{ projectId: string }> }

/** `?lang=` → milestones-<project>-<date>.xlsx (summary, 検収記録, 残課題, 引き渡し資料). */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const lang = await resolveExcelLang(request, gate.session.user.id)
    const { buffer, fileName } = await exportMilestoneBoard(projectId, lang)
    return xlsxResponse(buffer, fileName)
  } catch (error) {
    return toHttpResponse(error, { fallback: "エクスポートに失敗しました", context: "Milestone board EXPORT" })
  }
}
