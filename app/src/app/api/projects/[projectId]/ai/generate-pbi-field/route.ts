import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireProject } from "@/lib/authz"
import { buildAnalysisSystem, analysisStreamResponse, normalizeLang, type AILang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { aiLog } from "@/lib/ai-monitor"

/**
 * Generate ONE field of a PBI being drafted in the backlog form:
 * a user story or acceptance criteria, seeded by whatever the PO has already
 * typed (initiative / epic / the other field). Streams plain text so the
 * client can type the result into the textarea live.
 *
 * PO-only, matching the PBI create/edit permission.
 */

const bodySchema = z.object({
  field: z.enum(["userStory", "acceptanceCriteria"]),
  initiative: z.string().max(2000).optional(),
  epic: z.string().max(500).optional(),
  userStory: z.string().max(5000).optional(),
  acceptanceCriteria: z.string().max(5000).optional(),
  lang: z.enum(["ja", "en", "id"]).optional(),
})

const FIELD_INSTRUCTIONS: Record<AILang, Record<"userStory" | "acceptanceCriteria", string>> = {
  ja: {
    userStory: `PBI 草案の情報から **ユーザーストーリーを1つだけ** 作成してください。
- 形式: 「<Who>として<What>したい。それは<Why>だからだ。」
- INVEST 原則に沿う。1〜3文、簡潔に。
- ユーザーストーリー本文のみを出力する。見出し・説明・引用符・Markdown は出力しない。
- 必ず日本語で書く。`,
    acceptanceCriteria: `PBI 草案の情報から **受入条件を 3〜5 点** 作成してください。
- 各行を「- 」で始める箇条書きのみ。
- 検証可能・具体的に（曖昧な「正しく動く」は禁止）。
- 箇条書き以外の文字（見出し・説明・Markdown 記号）は出力しない。
- 必ず日本語で書く。`,
  },
  en: {
    userStory: `From the PBI draft information, write **exactly one user story**.
- Format: "As a <who>, I want <what>, so that <why>."
- Follow INVEST. 1-3 sentences, concise.
- Output ONLY the user story text — no headings, explanations, quotes, or markdown.
- Write in English.`,
    acceptanceCriteria: `From the PBI draft information, write **3-5 acceptance criteria**.
- Bullet lines only, each starting with "- ".
- Verifiable and concrete (no vague "works correctly").
- Output nothing except the bullet lines — no headings, explanations, or markdown.
- Write in English.`,
  },
  id: {
    userStory: `Dari informasi draf PBI, tulis **tepat satu user story**.
- Format: "Sebagai <siapa>, saya ingin <apa>, agar <mengapa>."
- Ikuti prinsip INVEST. 1-3 kalimat, ringkas.
- Keluarkan HANYA teks user story — tanpa judul, penjelasan, kutipan, atau markdown.
- Tulis dalam Bahasa Indonesia.`,
    acceptanceCriteria: `Dari informasi draf PBI, tulis **3-5 kriteria penerimaan**.
- Hanya baris poin, masing-masing diawali "- ".
- Dapat diverifikasi dan konkret (hindari "berfungsi dengan benar" yang samar).
- Jangan keluarkan apa pun selain baris poin — tanpa judul, penjelasan, atau markdown.
- Tulis dalam Bahasa Indonesia.`,
  },
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  // Same rule as creating / editing a PBI: PO and SM (admins always pass;
  // see src/lib/authz/policy.ts) may use AI field generation.
  const auth = await requireProject(projectId, "ai.draftPbi")
  if ("error" in auth) return auth.error

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: "invalid_request", code: "VALIDATION" }, { status: 400 })
  }
  const lang = normalizeLang(body.lang)

  // A seed is required: generating from a completely empty form would only
  // produce generic filler the PO has to delete anyway.
  const seed = [body.initiative, body.userStory, body.acceptanceCriteria].some(
    (v) => v && v.trim()
  )
  if (!seed) {
    return NextResponse.json({ error: "seed_required", code: "VALIDATION" }, { status: 400 })
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true, projectType: true },
  })
  const productGoals = await prisma.productGoal.findMany({
    where: { projectId },
    select: { title: true, description: true },
    orderBy: { createdAt: "asc" },
  })

  const lines: string[] = []
  if (project) {
    lines.push(`# プロジェクト / Project: ${project.name}`)
    if (project.description) lines.push(`説明 / Description: ${project.description}`)
    lines.push(`タイプ / Type: ${project.projectType}`)
  }
  if (productGoals.length) {
    lines.push(`\n# プロダクトゴール / Product goals`)
    for (const g of productGoals) lines.push(`- ${g.title}${g.description ? `: ${g.description}` : ""}`)
  }
  lines.push(`\n# 作成中の PBI 草案 / PBI draft in progress`)
  if (body.initiative?.trim()) lines.push(`## 施策 / Initiative\n${body.initiative.trim()}`)
  if (body.epic?.trim()) lines.push(`## エピック / Epic\n${body.epic.trim()}`)
  if (body.field !== "userStory" && body.userStory?.trim()) {
    lines.push(`## ユーザーストーリー / User story\n${body.userStory.trim()}`)
  }
  if (body.field !== "acceptanceCriteria" && body.acceptanceCriteria?.trim()) {
    lines.push(`## 受入条件 / Acceptance criteria\n${body.acceptanceCriteria.trim()}`)
  }

  aiLog("ANALYSIS", `generate-pbi-field: ${body.field} (${lang})`)
  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(FIELD_INSTRUCTIONS[lang][body.field], lang) },
    { role: "user", content: lines.join("\n") },
  ]

  return analysisStreamResponse(messages, {
    temperature: 0.4,
    numPredict: 1024,
    label: `generate-pbi-field:${body.field}`,
    signal: request.signal,
    timeoutMs: OLLAMA_TIMEOUTS.field,
  })
}
