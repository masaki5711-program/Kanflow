import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { normalizeLang } from "@/lib/ai-analysis"
import { getVersionReleaseNote } from "@/services/git/git-releases.service"
import { releaseSummaryResponse } from "@/services/git/git-release-ai"

const bodySchema = z.object({ version: z.string().min(1).max(100), lang: z.enum(["ja", "en", "id"]).optional() })

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params
  const auth = await requireProject(projectId, "ai.use")
  if ("error" in auth) return auth.error

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: "invalid_body", code: "VALIDATION_ERROR" }, { status: 400 })
  const lang = normalizeLang(parsed.data.lang)

  const note = await getVersionReleaseNote(projectId, parsed.data.version, lang)
  if (!note.enabled || note.mergedCount === 0) return NextResponse.json({ error: "no_merged_mrs", code: "NO_MERGED_MRS" }, { status: 422 })
  return releaseSummaryResponse(note.text, lang, request.signal)
}
