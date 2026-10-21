import { NextResponse } from "next/server"
import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { buildAnalysisSystem, analysisStreamResponse, normalizeLang, type AILang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { getSprintReleaseNote } from "@/services/git/git-insights.service"

const bodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

const INSTRUCTIONS: Record<AILang, string> = {
  ja: `次はスプリント期間中にマージされたマージリクエスト（MR）の一覧です。スプリントレビューで使う成果の要約を書いてください。

## 出力フォーマット（厳守）
### 今回できるようになったこと
- 利用者・関係者の視点で 3〜5 件。技術用語は避け、PBI ごとの価値を書く

### 技術的なトピック
- 開発者向けに 2〜3 件（大きな変更、リスク、次に効く改善など）

提供された MR の範囲のみで書き、推測や捏造をしないでください。`,
  en: `Below are the merge requests (MRs) merged during the sprint. Write an outcome summary for the sprint review.

## Output Format (strict)
### What users can do now
- 3–5 bullets from the users' / stakeholders' point of view, avoiding jargon, one value per PBI

### Technical notes
- 2–3 bullets for developers (big changes, risks, improvements that help next)

Use only the MRs provided; do not speculate or fabricate.`,
  id: `Berikut adalah merge request (MR) yang di-merge selama sprint. Tulis ringkasan hasil untuk sprint review.

## Format Output (wajib)
### Yang kini bisa dilakukan pengguna
- 3–5 poin dari sudut pandang pengguna/pemangku kepentingan, hindari jargon, satu nilai per PBI

### Catatan teknis
- 2–3 poin untuk pengembang (perubahan besar, risiko, perbaikan yang membantu berikutnya)

Gunakan hanya MR yang diberikan; jangan berspekulasi atau mengarang.`,
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; sprintId: string }> }) {
  const { projectId, sprintId } = await params
  const auth = await requireProject(projectId, "ai.use")
  if ("error" in auth) return auth.error

  const json = await request.json().catch(() => ({}))
  const parsed = bodySchema.safeParse(json)
  const lang = normalizeLang(parsed.success ? parsed.data?.lang : undefined)

  const note = await getSprintReleaseNote(projectId, sprintId, lang)
  if (!note.enabled || note.mergedCount === 0) return NextResponse.json({ error: "no_merged_mrs", code: "NO_MERGED_MRS" }, { status: 422 })

  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(INSTRUCTIONS[lang], lang) },
    { role: "user", content: note.text },
  ]
  return analysisStreamResponse(messages, {
    temperature: 0.3,
    label: "release-summary",
    signal: request.signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
  })
}
