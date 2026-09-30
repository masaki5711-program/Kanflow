import { requireProject } from "@/lib/authz"
import { actorFromSession, jsonResponse, toHttpResponse } from "@/services/_shared"
import { importBacklog } from "@/services/excel/backlog.import.service"
import { assertImportRequestSize, readUploadedXlsx } from "@/services/excel/excel.upload"

type Params = { params: Promise<{ projectId: string }> }

/**
 * multipart/form-data `file` (.xlsx, ≤ 5 MB, ≤ 500 rows).
 * `?dryRun=1` → preview `{ dryRun, summary, rows }` (nothing written);
 * otherwise commit in one transaction (400 `reason: ROW_ERRORS` + preview when any row is invalid).
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId } = await params
  const gate = await requireProject(projectId, "backlog.write")
  if ("error" in gate) return gate.error

  try {
    assertImportRequestSize(request)
    const dryRun = new URL(request.url).searchParams.get("dryRun") === "1"
    // Not multipart (or a broken body) → treated as "no file" (400), not a server error.
    const form = await request.formData().catch(() => null)
    const buffer = await readUploadedXlsx(form?.get("file") ?? null)
    return jsonResponse(await importBacklog(projectId, buffer, actorFromSession(gate.session), { dryRun }))
  } catch (error) {
    return toHttpResponse(error, { fallback: "取り込みに失敗しました", context: "Backlog IMPORT" })
  }
}
