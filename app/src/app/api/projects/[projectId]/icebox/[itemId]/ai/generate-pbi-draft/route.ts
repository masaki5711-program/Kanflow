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

  const INSTRUCTIONS: Record<AILang, string> = {
    ja: `あなたはアジャイル開発の Product Owner 補佐 AI です。
Icebox 項目から **Product Backlog Item (PBI) 草案を 3 案** 提示してください。

## 出力フォーマット（JSON のみ、他のテキストは一切出力しない）
\`\`\`json
{
  "drafts": [
    {
      "initiative": "大方針 (50字以内)",
      "epic": "機能群 (30字以内)",
      "userStory": "<Who>として<What>したい。それは<Why>だからだ。",
      "acceptanceCriteria": "受入条件を箇条書きで 3〜5 点（- で始まる行）",
      "workloadScore": 3,
      "rationale": "この案の特徴を 1〜2 文 (100字以内)"
    }
  ]
}
\`\`\`

## ルール
- 必ず 3 案。観点を変えて多様性を持たせる（例: 最小 MVP / 段階導入 / 横展開）
- workloadScore は 0,1,2,3,5,8,13,21 のいずれか
- **workloadScore は「SP見積の参照データ」（完了実績の分布と類例）と照らして採点し、rationale に根拠（類似の完了 PBI 例）を1つ挙げる**
- **「既存バックログ一覧」と重複する内容の案は出さない。**既存と関連する場合は差別化点を rationale に書く（既存 #id を引用してよい）
- **epic は既存バックログに同じ機能群のエピック名があればそれに揃える。**無ければ新設してよい
- 「添付ファイルの内容（抜粋）」がある場合は、その仕様・要件を acceptanceCriteria に反映する
- userStory は INVEST 原則に沿う
- すべての文字列フィールドは **日本語** で出力する
- 入力範囲外の事実を捏造しない
- JSON 以外の文字（コメント、説明、コードブロック記号）は出力しない`,
    en: `You are a Product Owner assistant AI for agile development.
Generate **3 Product Backlog Item (PBI) draft proposals** from the Icebox item.

## Output Format (JSON only, no other text)
\`\`\`json
{
  "drafts": [
    {
      "initiative": "high-level direction (≤80 chars)",
      "epic": "feature group (≤50 chars)",
      "userStory": "As a <who>, I want <what>, so that <why>.",
      "acceptanceCriteria": "3–5 bullet points beginning with '- '",
      "workloadScore": 3,
      "rationale": "what makes this draft distinctive (1–2 sentences, ≤150 chars)"
    }
  ]
}
\`\`\`

## Rules
- Exactly 3 drafts with distinct angles (e.g., minimal MVP / phased rollout / parallel adoption)
- workloadScore must be one of 0, 1, 2, 3, 5, 8, 13, 21
- **Calibrate workloadScore against the "SP estimation reference" (completed-work distribution and examples) and cite one similar completed PBI in the rationale**
- **Do not propose drafts duplicating the "existing backlog list"**; when related, state the differentiation in the rationale (you may cite existing #ids)
- **Reuse an existing epic name from the backlog when the feature group matches**; otherwise a new epic is fine
- When "attachment content excerpts" exist, reflect their specs/requirements in the acceptanceCriteria
- userStory must follow INVEST principles
- All string fields must be in **English**
- Do not fabricate facts beyond the provided context
- Output only JSON; no comments, explanations, or code fences`,
    id: `Anda adalah asisten AI Product Owner untuk pengembangan agile.
Buat **3 usulan draf Product Backlog Item (PBI)** dari item Icebox.

## Format Output (hanya JSON, tanpa teks lain)
\`\`\`json
{
  "drafts": [
    {
      "initiative": "arah besar (≤80 karakter)",
      "epic": "kelompok fitur (≤50 karakter)",
      "userStory": "Sebagai <siapa>, saya ingin <apa>, agar <mengapa>.",
      "acceptanceCriteria": "3–5 poin diawali '- '",
      "workloadScore": 3,
      "rationale": "ciri khas draf ini (1–2 kalimat, ≤150 karakter)"
    }
  ]
}
\`\`\`

## Aturan
- Tepat 3 draf dengan sudut pandang berbeda (mis. MVP minimal / penerapan bertahap / adopsi paralel)
- workloadScore harus salah satu dari 0, 1, 2, 3, 5, 8, 13, 21
- **Kalibrasikan workloadScore dengan "data referensi estimasi SP" (distribusi & contoh pekerjaan selesai) dan sebutkan satu PBI selesai yang serupa dalam rationale**
- **Jangan usulkan draf yang duplikat dengan "daftar backlog yang ada"**; jika berkaitan, jelaskan pembedanya dalam rationale (boleh mengutip #id yang ada)
- **Gunakan nama epic yang sudah ada jika kelompok fiturnya sama**; jika tidak ada, boleh membuat epic baru
- Jika ada "kutipan isi lampiran", cerminkan spesifikasinya dalam acceptanceCriteria
- userStory mengikuti prinsip INVEST
- Semua field string harus dalam **Bahasa Indonesia**
- Jangan mengarang fakta di luar konteks yang diberikan
- Output hanya JSON; tanpa komentar, penjelasan, atau pagar kode`,
  }
  const instruction = INSTRUCTIONS[lang]

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
