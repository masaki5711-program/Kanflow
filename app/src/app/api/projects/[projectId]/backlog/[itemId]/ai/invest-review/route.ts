import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireProject } from "@/lib/authz"
import { buildAnalysisSystem, analysisStreamResponse, normalizeLang, type AILang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"

const bodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

const INSTRUCTIONS: Record<AILang, string> = {
  ja: `次の PBI を **INVEST 原則** で評価してください。

INVEST の 6 原則:
- Independent（独立している）
- Negotiable（交渉可能）
- Valuable（価値がある）
- Estimable（見積もり可能）
- Small（小さい）
- Testable（テスト可能）

## 出力フォーマット
各原則について以下の形式で出力:
**[I/N/V/E/S/T] [✅ Pass | ⚠️ Partial | ❌ Fail]** — 1〜2 文の根拠

最後に「## 改善提案」セクションを設け、最大 3 件の具体的な改善案を箇条書きで提示してください。書き換え例があれば併記してください。

評価は与えられた PBI 情報の範囲のみで行い、コンテキストにない事実を仮定しないでください。`,
  en: `Evaluate the following PBI against the **INVEST principles**.

INVEST six principles:
- Independent
- Negotiable
- Valuable
- Estimable
- Small
- Testable

## Output Format
For each principle, output in this format:
**[I/N/V/E/S/T] [✅ Pass | ⚠️ Partial | ❌ Fail]** — 1–2 sentences of rationale

Then add an "## Improvement Suggestions" section with up to 3 specific suggestions in bullet form. Include rewritten examples where helpful.

Evaluate only based on the provided PBI; do not assume facts that are not in the context.`,
  id: `Evaluasi PBI berikut berdasarkan **prinsip INVEST**.

Enam prinsip INVEST:
- Independent (Mandiri)
- Negotiable (Dapat Dinegosiasikan)
- Valuable (Bernilai)
- Estimable (Dapat Diestimasi)
- Small (Kecil)
- Testable (Dapat Diuji)

## Format Output
Untuk setiap prinsip, gunakan format ini:
**[I/N/V/E/S/T] [✅ Pass | ⚠️ Partial | ❌ Fail]** — 1–2 kalimat alasan

Kemudian tambahkan bagian "## Saran Perbaikan" dengan maksimal 3 saran spesifik dalam bentuk poin. Sertakan contoh penulisan ulang jika relevan.

Evaluasi hanya berdasarkan PBI yang diberikan; jangan mengasumsikan fakta yang tidak ada dalam konteks.`,
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  const auth = await requireProject(projectId, "ai.use")
  if ("error" in auth) return auth.error

  let lang: AILang = "ja"
  try {
    const json = await request.json().catch(() => ({}))
    const parsed = bodySchema.parse(json)
    lang = normalizeLang(parsed?.lang)
  } catch { /* default ja */ }

  const item = await prisma.productBacklogItem.findFirst({
    where: { id: itemId, projectId },
    select: {
      displayId: true,
      initiative: true,
      epic: true,
      userStory: true,
      acceptanceCriteria: true,
      workloadScore: true,
    },
  })
  if (!item) return NextResponse.json({ error: "not_found", code: "PBI_NOT_FOUND" }, { status: 404 })

  const labels: Record<AILang, { title: string; init: string; epic: string; sp: string; us: string; ac: string }> = {
    ja: { title: "評価対象 PBI", init: "イニシアティブ", epic: "エピック", sp: "見積もり", us: "ユーザーストーリー", ac: "受入条件" },
    en: { title: "Target PBI", init: "Initiative", epic: "Epic", sp: "Estimate", us: "User Story", ac: "Acceptance Criteria" },
    id: { title: "PBI yang Dievaluasi", init: "Inisiatif", epic: "Epic", sp: "Estimasi", us: "User Story", ac: "Kriteria Penerimaan" },
  }
  const L = labels[lang]
  const NA = lang === "ja" ? "(未入力)" : lang === "id" ? "(belum diisi)" : "(not entered)"

  const pbiText = [
    `# ${L.title} #${item.displayId}`,
    `${L.init}: ${item.initiative ?? NA}`,
    `${L.epic}: ${item.epic ?? NA}`,
    `${L.sp}: ${item.workloadScore} (SP)`,
    "",
    `## ${L.us}`,
    item.userStory || NA,
    "",
    `## ${L.ac}`,
    item.acceptanceCriteria || NA,
  ].join("\n")

  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(INSTRUCTIONS[lang], lang) },
    { role: "user", content: pbiText },
  ]

  return analysisStreamResponse(messages, {
    temperature: 0.2,
    label: "invest-review",
    signal: request.signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
  })
}
