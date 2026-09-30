import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { resolveExcelLang } from "@/services/excel/excel.lang"
import { xlsxResponse } from "@/services/excel/excel.shared"
import { exportIcebox } from "@/services/excel/icebox.export"

type Params = { params: Promise<{ projectId: string }> }

/** `?lang=` → icebox-<project>-<date>.xlsx. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const lang = await resolveExcelLang(request, gate.session.user.id)
    const { buffer, fileName } = await exportIcebox(projectId, lang)
    return xlsxResponse(buffer, fileName)
  } catch (error) {
    return toHttpResponse(error, { fallback: "エクスポートに失敗しました", context: "Icebox EXPORT" })
  }
}
