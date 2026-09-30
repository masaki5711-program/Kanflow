import { requireProject } from "@/lib/authz"
import { toHttpResponse } from "@/services/_shared"
import { XLSX_MIME, contentDisposition, exportPlan } from "@/services/plan/plan.export"
import { EXPORT_LANGS, type ExportLang } from "@/services/plan/plan.schemas"

type Params = { params: Promise<{ projectId: string }> }

function langOf(raw: string | null): ExportLang {
  return (EXPORT_LANGS as readonly string[]).includes(raw ?? "") ? (raw as ExportLang) : "ja"
}

/** `?lang=ja|en|id` (headers / labels; default ja) → plan-<project>-<date>.xlsx download. */
export async function GET(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "project.view")
  if ("error" in gate) return gate.error

  try {
    const { buffer, fileName } = await exportPlan(projectId, langOf(new URL(request.url).searchParams.get("lang")))
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": XLSX_MIME,
        "Content-Disposition": contentDisposition(fileName),
        "Cache-Control": "no-store",
      },
    })
  } catch (error) {
    return toHttpResponse(error, { fallback: "エクスポートに失敗しました", context: "Plan EXPORT" })
  }
}
