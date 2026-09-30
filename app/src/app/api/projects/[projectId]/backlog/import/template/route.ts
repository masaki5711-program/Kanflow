import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { importTemplate } from "@/services/excel/backlog.import-template"
import { resolveExcelLang } from "@/services/excel/excel.lang"
import { xlsxResponse } from "@/services/excel/excel.shared"

type Params = { params: Promise<{ projectId: string }> }

/** Empty import workbook (headers + example row + instructions sheet). Same right as the import. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    const lang = await resolveExcelLang(request, gate.session.user.id)
    const { buffer, fileName } = await importTemplate(projectId, lang)
    return xlsxResponse(buffer, fileName)
  } catch (error) {
    return toHttpResponse(error, { fallback: "テンプレートの作成に失敗しました", context: "Backlog import TEMPLATE" })
  }
}
