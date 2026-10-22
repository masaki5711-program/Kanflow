import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { normalizeLang } from "@/lib/ai-analysis"
import { getSprintReleaseNote } from "@/services/git/git-insights.service"
import { releaseSummaryResponse } from "@/services/git/git-release-ai"

const bodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; sprintId: string }> }) {
  const { projectId, sprintId } = await params
  const auth = await requireProject(projectId, "ai.use")
  if ("error" in auth) return auth.error

  const json = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(json)
  const lang = normalizeLang(parsed.success ? parsed.data?.lang : undefined)

  const note = await getSprintReleaseNote(projectId, sprintId, lang)
  if (!note.enabled || note.mergedCount === 0) return NextResponse.json({ error: "no_merged_mrs", code: "NO_MERGED_MRS" }, { status: 422 })
  return releaseSummaryResponse(note.text, lang, request.signal)
}
