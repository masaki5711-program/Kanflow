import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireProject } from "@/lib/authz"
import { buildAnalysisSystem, normalizeLang, analysisStreamResponse, type AILang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { analysisHandlers } from "@/lib/analysis-tools"
import { extractAttachment } from "@/lib/attachment-extractor"
import { aiLog } from "@/lib/ai-monitor"
import { pbiDraftInstructions } from "@/lib/pbi-draft-prompt"

const langBodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; itemId: string }> }
) {
  const { projectId, itemId } = await params
  // Same rule as creating a PBI (POST /backlog): PO and SM may author PBIs,
  // so both may ask the AI for drafts. Admins always pass (authz policy).
  const auth = await requireProject(projectId, "ai.draftPbi")
  if ("error" in auth) return auth.error

  let lang: AILang = "ja"
  try {
    const json = await request.json().catch(() => ({}))
    const parsed = langBodySchema.parse(json)
    lang = normalizeLang(parsed?.lang)
  } catch { /* default ja */ }

  const item = await prisma.iceboxItem.findFirst({
    where: { id: itemId, projectId, deletedAt: null },
    select: {
      displayId: true,
      author: true,
      request: true,
      background: true,
      poHearingMemo: true,
      poReviewMemo: true,
      attachments: { select: { fileName: true, originalName: true, mimeType: true } },
    },
  })
  if (!item) return NextResponse.json({ error: "not_found", code: "ICEBOX_ITEM_NOT_FOUND" }, { status: 404 })

  const productGoals = await prisma.productGoal.findMany({
    where: { projectId },
    select: { title: true, description: true },
    orderBy: { createdAt: "asc" },
  })

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { name: true, description: true, projectType: true, pointUnit: true },
  })

  aiLog("ANALYSIS", `pbi-draft: context gathering for icebox #${item.displayId}`)

  // Pre-fetch analysis-tool context (same MCP-style tools the chat uses, run
  // deterministically here so the draft is grounded in real project data):
  // existing backlog (dedup / epic alignment) + estimation reference (SP
  // calibration from the team's own completed work).
  const toolT0 = Date.now()
  aiLog("TOOL_CALL", "list_backlog_items({}) ← pre-fetched for PBI draft")
  const backlogJson = await analysisHandlers.list_backlog_items({ projectId, args: {} })
  aiLog("TOOL_RESULT", `list_backlog_items → ${backlogJson.length} chars in ${Date.now() - toolT0}ms`)
  const estT0 = Date.now()
  aiLog("TOOL_CALL", "get_estimation_reference({}) ← pre-fetched for PBI draft")
  const estimationJson = await analysisHandlers.get_estimation_reference({ projectId, args: {} })
  aiLog("TOOL_RESULT", `get_estimation_reference → ${estimationJson.length} chars in ${Date.now() - estT0}ms`)

  // Extract attachment contents (up to 2 files, excerpt only) so specs and
  // requirement docs attached to the icebox item can ground the drafts.
  const ATTACH_MAX_FILES = 2
  const ATTACH_MAX_CHARS = 2500
  const attachmentExcerpts: string[] = []
  for (const a of item.attachments.slice(0, ATTACH_MAX_FILES)) {
    const exT0 = Date.now()
    aiLog("TOOL_CALL", `extract_attachment_content("${a.originalName}") ← pre-fetched for PBI draft`)
    const ex = await extractAttachment({
      projectId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      originalName: a.originalName,
    })
    if (ex.ok) {
      const excerpt = ex.text.length > ATTACH_MAX_CHARS ? ex.text.slice(0, ATTACH_MAX_CHARS) + "…(抜粋)" : ex.text
      attachmentExcerpts.push(`### ${a.originalName}\n${excerpt}`)
      aiLog("TOOL_RESULT", `extract "${a.originalName}" → ${excerpt.length} chars in ${Date.now() - exT0}ms`)
    } else {
      aiLog("TOOL_RESULT", `extract "${a.originalName}" failed: ${ex.error}`)
    }
  }

  const lines: string[] = []
  lines.push(`# 元 Icebox 項目 #${item.displayId} (起票者: ${item.author})`)
  lines.push(`## 要望\n${item.request}`)
  if (item.background) lines.push(`## 背景\n${item.background}`)
  if (item.poHearingMemo) lines.push(`## PO ヒアリングメモ\n${item.poHearingMemo}`)
  if (item.poReviewMemo) lines.push(`## PO レビューメモ\n${item.poReviewMemo}`)
  if (item.attachments.length) {
    lines.push(`## 添付ファイル\n` + item.attachments.map((a) => `- ${a.originalName} (${a.mimeType})`).join("\n"))
  }
  if (attachmentExcerpts.length) {
    lines.push(`\n## 添付ファイルの内容（抜粋）\n${attachmentExcerpts.join("\n\n")}`)
  }
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

  // The same instructions as the White Board's shape drafts (lib/pbi-draft-prompt.ts).
  const instruction = pbiDraftInstructions(lang, "icebox")

  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(instruction, lang) },
    { role: "user", content: lines.join("\n") },
  ]

  // Stream the JSON-formatted response so the client can render each draft as
  // soon as its `{...}` object closes, matching the chat/translate UX.
  // `num_predict: 4096` is needed because format:"json" forces a grammar that
  // forbids the EOS token mid-JSON; without an explicit cap Ollama's default
  // (~128 tokens) truncates the response in the middle of draft #1.
  // numCtx raised to 12288: the prompt now carries backlog list + estimation
  // reference + attachment excerpts on top of the icebox item, and the JSON
  // grammar needs numPredict=4096 of output headroom within the same window.
  return analysisStreamResponse(messages, {
    temperature: 0.5,
    format: "json",
    numPredict: 4096,
    label: "pbi-draft",
    signal: request.signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
  })
}
