import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireProjectMember } from "@/lib/api-helpers"
import { buildAnalysisSystem, streamAnalysis, streamingResponse, normalizeLang, type AILang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"

const bodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

function trunc(s: string | null | undefined, n: number): string {
  if (!s) return ""
  const t = s.trim()
  return t.length > n ? t.slice(0, n) + "…" : t
}

const INSTRUCTIONS: Record<AILang, string> = {
  ja: `あなたはアジャイルコーチです。次のスプリント情報から、振り返り結果を 3 セクションで要約してください。

## 出力フォーマット（厳守）
### 主な成果
- 箇条書きで 3〜5 件、定量的な指標があれば含める

### 主な課題
- 箇条書きで 3〜5 件、根本原因に踏み込む

### 次スプリントへの改善提案 (Try)
- 最大 3 件、具体的なアクション形式（誰が・何を・いつまで）
- 既存 Try と重複しないこと

提供データの範囲のみで分析し、推測や捏造を避けてください。`,
  en: `You are an agile coach. Summarize the following sprint information into a 3-section retrospective digest.

## Output Format (strict)
### Key Achievements
- 3–5 bullet points, including quantitative indicators where available

### Key Issues
- 3–5 bullet points, addressing root causes

### Improvement Proposals for Next Sprint (Try)
- Up to 3, in concrete action form (who · what · by when)
- Avoid duplicating existing Try entries

Analyze strictly within the provided data; avoid speculation or fabrication.`,
  id: `Anda adalah pelatih agile. Rangkum informasi sprint berikut menjadi ringkasan retrospektif dalam 3 bagian.

## Format Output (wajib)
### Pencapaian Utama
- 3–5 poin, sertakan indikator kuantitatif bila tersedia

### Masalah Utama
- 3–5 poin, telusuri akar penyebab

### Usulan Perbaikan untuk Sprint Berikutnya (Try)
- Maksimal 3, dalam bentuk tindakan konkret (siapa · apa · sampai kapan)
- Hindari duplikasi dengan Try yang sudah ada

Analisis hanya berdasarkan data yang diberikan; hindari spekulasi atau rekayasa.`,
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; sprintId: string }> }
) {
  const { projectId, sprintId } = await params
  const auth = await requireProjectMember(projectId)
  if ("error" in auth) return auth.error

  let lang: AILang = "ja"
  try {
    const json = await request.json().catch(() => ({}))
    const parsed = bodySchema.parse(json)
    lang = normalizeLang(parsed?.lang)
  } catch { /* default ja */ }

  const sprint = await prisma.sprint.findFirst({
    where: { id: sprintId, projectId },
    include: {
      items: {
        include: { pbItem: { select: { displayId: true, initiative: true, userStory: true } } },
      },
      dailyScrumNotes: { orderBy: { date: "asc" } },
    },
  })
  if (!sprint) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const lines: string[] = []
  lines.push(`# Sprint: ${sprint.sprintName}`)
  lines.push(`期間 / Period: ${sprint.startDate.toISOString().slice(0, 10)} 〜 ${sprint.endDate.toISOString().slice(0, 10)}`)
  lines.push(`Status: ${sprint.status}`)
  if (sprint.sprintGoal) lines.push(`Goal: ${trunc(sprint.sprintGoal, 200)}`)
  lines.push(`Capacity: ${sprint.capacity} / Actual: ${sprint.actualScore}`)

  if (sprint.items.length) {
    lines.push("\n## Tasks")
    for (const it of sprint.items) {
      lines.push(
        `- [${it.status}] #${it.pbItem.displayId} ${trunc(it.taskName ?? it.pbItem.initiative ?? it.pbItem.userStory ?? "(no name)", 80)}` +
          (it.assignee ? ` (assignee: ${it.assignee})` : "") +
          (it.estimatedHours != null ? ` est: ${it.estimatedHours}` : "") +
          (it.actualHours != null ? ` actual: ${it.actualHours}` : "")
      )
    }
  }

  if (sprint.dailyScrumNotes.length) {
    lines.push("\n## Daily Scrum Notes")
    for (const n of sprint.dailyScrumNotes) {
      lines.push(`- ${n.date.toISOString().slice(0, 10)}${n.author ? ` (${n.author})` : ""}: ${trunc(n.content, 200)}`)
    }
  }

  if (sprint.retrospectiveKeep) lines.push(`\n## Keep\n${trunc(sprint.retrospectiveKeep, 600)}`)
  if (sprint.retrospectiveProblem) lines.push(`\n## Problem\n${trunc(sprint.retrospectiveProblem, 600)}`)
  if (sprint.retrospectiveTry) lines.push(`\n## Existing Try\n${trunc(sprint.retrospectiveTry, 400)}`)
  if (sprint.retrospectiveMemo) lines.push(`\n## Other Memo\n${trunc(sprint.retrospectiveMemo, 400)}`)

  const sprintBlob = lines.join("\n")

  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(INSTRUCTIONS[lang], lang) },
    { role: "user", content: sprintBlob },
  ]

  const stream = streamAnalysis(messages, { temperature: 0.3 })
  return streamingResponse(stream)
}
