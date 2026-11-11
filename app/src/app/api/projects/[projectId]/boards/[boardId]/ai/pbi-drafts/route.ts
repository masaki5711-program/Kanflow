import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authorizeProject, can } from "@/lib/authz"
import { buildAnalysisSystem, analysisStreamResponse, normalizeLang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { analysisHandlers } from "@/lib/analysis-tools"
import { aiLog } from "@/lib/ai-monitor"
import { ELEMENT_ID_PATTERN } from "@/lib/board/limits"
import { pbiDraftInstructions } from "@/lib/pbi-draft-prompt"
import { getRateLimiter, retryAfterSeconds } from "@/lib/rate-limit"
import { errorResponse, toHttpResponse } from "@/services/_shared"
import { shapeDraftSource } from "@/services/boards/boards.collab"
import { readBoundedJson } from "@/services/boards/boards.http"

type Params = { params: Promise<{ projectId: string; boardId: string }> }

const bodySchema = z.object({
  sheetId: z.string().min(1).max(40),
  elementId: z.string().regex(ELEMENT_ID_PATTERN),
  lang: z.enum(["ja", "en", "id"]).optional(),
})

/**
 * Three PBI drafts for a White Board shape, from the shape and its surroundings (shapes connected by arrows, its
 * frame, its group, open comments) plus the same project references as the IceBox drafts (backlog, estimation
 * reference, product goals). Streamed like the IceBox drafts. The same right as drafting from IceBox (ai.draftPbi);
 * the shape's sheet is read as stored, and only the local Ollama sees it, when the person asks.
 */
export async function POST(request: Request, { params }: Params) {
  const { projectId, boardId } = await params
  // Drafting PBIs (as from IceBox) and seeing the board: the drafts read its text and comments.
  const auth = await authorizeProject(projectId, (actor) => can(actor, "ai.draftPbi") && can(actor, "board.read"))
  if ("error" in auth) return auth.error
  const { allowed, status } = getRateLimiter("board-ai", { limit: 6, windowMs: 60_000 }).consume(auth.session.user.id)
  if (!allowed) return errorResponse(429, "Too many requests", "RATE_LIMITED", { headers: { "Retry-After": retryAfterSeconds(status) } })

  let input: z.infer<typeof bodySchema>
  let source: string[] | null
  try {
    input = bodySchema.parse(await readBoundedJson(request, 4 * 1024))
    source = await shapeDraftSource(projectId, boardId, input.sheetId, input.elementId)
  } catch (error) {
    return toHttpResponse(error, { fallback: "AI の処理に失敗しました", context: "Board PBI drafts" })
  }
  if (!source) return NextResponse.json({ error: "The shape has no text", code: "VALIDATION" }, { status: 400 })
  const lang = normalizeLang(input.lang)

  const [productGoals, project] = await Promise.all([
    prisma.productGoal.findMany({ where: { projectId }, select: { title: true, description: true }, orderBy: { createdAt: "asc" } }),
    prisma.project.findUnique({ where: { id: projectId }, select: { name: true, description: true, projectType: true, pointUnit: true } }),
  ])
  aiLog("ANALYSIS", `pbi-draft: context gathering for a board shape`)
  const backlogJson = await analysisHandlers.list_backlog_items({ projectId, args: {} })
  const estimationJson = await analysisHandlers.get_estimation_reference({ projectId, args: {} })

  const lines = [...source]
  if (project) {
    lines.push(`\n# プロジェクト: ${project.name}`)
    if (project.description) lines.push(`説明: ${project.description}`)
    lines.push(`タイプ: ${project.projectType} / 見積単位: ${project.pointUnit}`)
  }
  if (productGoals.length) {
    lines.push(`\n# プロダクトゴール`)
    for (const g of productGoals) lines.push(`- ${g.title}${g.description ? `: ${g.description}` : ""}`)
  }
  lines.push(`\n# 既存バックログ一覧（重複回避・エピック整合の参照用 / JSON）\n${backlogJson}`)
  lines.push(`\n# SP見積の参照データ（このチームの完了実績 / JSON）\n${estimationJson}`)

  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(pbiDraftInstructions(lang, "board"), lang) },
    { role: "user", content: lines.join("\n") },
  ]
  // As the IceBox drafts: streamed JSON (the client shows each draft as its object closes); numPredict for the grammar.
  return analysisStreamResponse(messages, {
    temperature: 0.5,
    format: "json",
    numPredict: 4096,
    label: "pbi-draft-board",
    signal: request.signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
  })
}
