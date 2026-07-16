import { z } from "zod"
import { requireProjectMember } from "@/lib/api-helpers"
import { buildAnalysisSystem, streamAnalysis, streamingResponse, normalizeLang, type AILang } from "@/lib/ai-analysis"
import { buildProjectContext } from "@/lib/project-context"
import type { ChatMessage } from "@/lib/ollama"

const bodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

const INSTRUCTIONS: Record<AILang, string> = {
  ja: `あなたはプロジェクトマネージャーの補佐 AI です。
以下のプロジェクト情報から、ステークホルダー向けの進捗レポートを作成してください。

## 出力フォーマット（厳守）
最大 2 段落・各 200 字程度で日本語のみで出力。

## 内容構成
- 第 1 段落: 全体の進捗状況・直近のスプリント成果
- 第 2 段落: 直近の課題・リスク・次のマイルストーン

具体的な数値（進捗率、PBI 数、スプリント名）はコンテキストから引用すること。
個人名は最小限に留め、メールアドレスは出力しないこと。`,
  en: `You are an assistant AI for project managers.
Produce a stakeholder-facing progress report from the project information below.

## Output Format (strict)
Up to 2 paragraphs, each around 200 characters, in English only.

## Content
- Paragraph 1: Overall progress and recent sprint achievements
- Paragraph 2: Recent issues, risks, and next milestones

Cite specific numbers (progress %, PBI counts, sprint names) from the context.
Mention individuals minimally; do not output email addresses.`,
  id: `Anda adalah asisten AI untuk manajer proyek.
Buat laporan progres untuk pemangku kepentingan dari informasi proyek berikut.

## Format Output (wajib)
Maksimal 2 paragraf, masing-masing sekitar 200 karakter, hanya dalam Bahasa Indonesia.

## Isi
- Paragraf 1: Progres keseluruhan dan pencapaian sprint terakhir
- Paragraf 2: Masalah terkini, risiko, dan tonggak berikutnya

Sertakan angka konkret (persen progres, jumlah PBI, nama sprint) dari konteks.
Sebutkan nama orang seminimal mungkin; jangan tampilkan alamat email.`,
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await requireProjectMember(projectId)
  if ("error" in auth) return auth.error

  let lang: AILang = "ja"
  try {
    const json = await request.json().catch(() => ({}))
    const parsed = bodySchema.parse(json)
    lang = normalizeLang(parsed?.lang)
  } catch { /* default ja */ }

  const context = await buildProjectContext(projectId)

  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(INSTRUCTIONS[lang], lang) },
    { role: "user", content: context },
  ]

  const stream = streamAnalysis(messages, { temperature: 0.4 })
  return streamingResponse(stream)
}
