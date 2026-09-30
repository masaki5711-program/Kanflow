import { ollamaChatTurn, type ChatMessage, type ToolCall } from "@/lib/ollama"
import { buildProjectContext } from "@/lib/project-context"
import { CHAT_TOOLS, runTool } from "@/lib/chat-tools"
import {
  SUBMIT_REPORT_TOOL,
  parseSubmittedReport,
  type StructuredReport,
} from "@/lib/report-tool"
import { structuredReportToMarkdown } from "@/lib/report-markdown"
import { aiLog, aiLogTrunc } from "@/lib/ai-monitor"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { OllamaTimeoutError } from "@/lib/ollama/errors"
import { anySignal, startDeadline } from "@/lib/ollama/signals"
import type { AILang } from "@/lib/ai-analysis"

/**
 * Goal-driven autonomous agent loop (no human in the loop).
 *
 * The same MCP-style tool loop the chat uses, but started from a machine
 * trigger (schedule / threshold / event) with an investigation GOAL instead
 * of a user question. The agent chooses tools by itself, reads results, and
 * finishes by CALLING the submit_report tool (report-tool.ts) with structured
 * fields — the terminal tool of the loop. The structured payload is persisted
 * on AiReport.structured and rendered as a formal report document in the
 * dashboard; a markdown rendering is kept in AiReport.body as fallback.
 * Plain-text endings (model didn't call the tool) still work: the raw text
 * becomes the body and structured stays null.
 *
 * This is the pilot for the IoT-platform pattern:
 *   trigger → autonomous investigation → report.
 */

const AGENT_LANG_RULES: Record<AILang, string> = {
  ja: "報告書の全フィールドは必ず日本語で書くこと（ツール結果が他言語でも同様）。",
  en: "Write every report field in English only (even when tool results are in another language).",
  id: "Tulis semua bidang laporan hanya dalam Bahasa Indonesia (meskipun hasil alat berbahasa lain).",
}

const AGENT_SYSTEM: Record<AILang, string> = {
  ja: `あなたは Kanflow に常駐する自律調査エージェントです。人間は介在しません。
与えられた調査ゴールに対して、必要なツールを自分で選んで実行し、事実を収集してから、最後に submit_report ツールを1回だけ呼び出して構造化された報告書を提出してください。

## 行動ルール
- 数値・件数・割合は必ずツール結果から引用する。自分で計算・推測しない。
- ツールで確認できないことは「不明」と書く。捏造は禁止。
- 調査は必要最小限のツール呼び出しで済ませる（同じツールの重複呼び出しを避ける）。
- 最終出力は必ず submit_report ツールで提出する。本文テキストで報告書を書いてはならない。
- submit_report には headline（結論1文）と overview（状況 2〜4文）を必ず入れ、findings（検知事項＋severity）、metrics（ツール結果からの数値）、causes（原因候補）、actions（推奨アクション 2〜4件＋priority）をできる限り埋める。
- ゴールに「前回の報告の指摘事項」が含まれる場合は、各指摘の現状をツールで確認し、followUps に1件ずつ対応状況（resolved=解消済み / improved=改善中 / unresolved=未対応）と根拠を記載する。`,
  en: `You are an autonomous investigation agent resident in Kanflow. No human is in the loop.
For the given investigation goal, choose and run the tools you need, gather facts, then finish by calling the submit_report tool exactly once with a structured report.

## Rules
- Quote every number from tool results; never compute or guess yourself.
- What tools cannot confirm is "unknown" — no fabrication.
- Keep tool calls minimal; avoid duplicate calls.
- The final output MUST be a submit_report tool call. Never write the report as plain text.
- In submit_report, always fill headline (one-sentence conclusion) and overview (2-4 sentences), and fill findings (with severity), metrics (numbers from tool results), causes, and actions (2-4 items with priority) as far as the facts allow.
- When the goal lists findings from a previous report, verify each with tools and record one followUps entry per finding (status: resolved / improved / unresolved, with evidence in note).`,
  id: `Anda adalah agen investigasi otonom yang berada di Kanflow. Tidak ada manusia yang terlibat.
Untuk tujuan investigasi yang diberikan, pilih dan jalankan alat yang diperlukan, kumpulkan fakta, lalu akhiri dengan memanggil alat submit_report tepat satu kali berisi laporan terstruktur.

## Aturan
- Kutip semua angka dari hasil alat; jangan menghitung atau menebak sendiri.
- Yang tidak dapat dikonfirmasi alat adalah "tidak diketahui" — dilarang mengarang.
- Minimalkan panggilan alat; hindari panggilan duplikat.
- Keluaran akhir HARUS berupa panggilan alat submit_report. Jangan menulis laporan sebagai teks biasa.
- Dalam submit_report, selalu isi headline (kesimpulan satu kalimat) dan overview (2-4 kalimat), serta isi findings (dengan severity), metrics (angka dari hasil alat), causes, dan actions (2-4 item dengan priority) sejauh fakta memungkinkan.
- Jika tujuan mencantumkan temuan dari laporan sebelumnya, verifikasi masing-masing dengan alat dan catat satu entri followUps per temuan (status: resolved / improved / unresolved, dengan bukti di note).`,
}

const CONTINUE_FOOTER: Record<AILang, string> = {
  ja: "\n\n---\n(注) 上記はツールの参照データ。調査を続けるか、十分な事実が揃ったら submit_report ツールで報告書を提出せよ。",
  en: "\n\n---\n(NOTE) Reference data from the tool. Continue investigating, or submit the report via the submit_report tool once you have enough facts.",
  id: "\n\n---\n(CATATAN) Data referensi dari alat. Lanjutkan investigasi, atau kirim laporan melalui alat submit_report jika fakta sudah cukup.",
}

const FORCE_REPORT_PROMPT: Record<AILang, string> = {
  ja: "ツールによる調査はここまで。集まった事実だけで、今すぐ submit_report ツールを呼び出して報告書を提出せよ。他のツールは呼ばないこと。",
  en: "Investigation tools are done. Call the submit_report tool NOW with a report built only from the gathered facts. Do not call any other tool.",
  id: "Investigasi alat selesai. Panggil alat submit_report SEKARANG dengan laporan yang hanya berdasarkan fakta yang terkumpul. Jangan panggil alat lain.",
}

export interface AgentResult {
  /** Markdown report body (rendered from the structured report when available). */
  report: string
  /** Structured report submitted via the submit_report tool; null when the model ended with plain text. */
  structured: StructuredReport | null
  toolCalls: { name: string; ms: number }[]
  iterations: number
  ms: number
}

const AGENT_TOOLS = [...CHAT_TOOLS, SUBMIT_REPORT_TOOL]

export async function runAgentInvestigation(opts: {
  projectId: string
  goal: string
  lang: AILang
  label: string
  maxIterations?: number
  /** Optional caller cancellation; the run also has a whole-run deadline. */
  signal?: AbortSignal
}): Promise<AgentResult> {
  const { projectId, goal, lang, label } = opts
  const maxIterations = opts.maxIterations ?? 5
  const t0 = Date.now()
  const toolCalls: { name: string; ms: number }[] = []

  aiLog("AGENT_START", `${label}: goal="${aiLogTrunc(goal, 100)}"`)

  const context = await buildProjectContext(projectId)
  const conversation: ChatMessage[] = [
    { role: "system", content: AGENT_SYSTEM[lang] },
    { role: "system", content: `# プロジェクト現状 / Project snapshot\n\n${context}` },
    { role: "system", content: AGENT_LANG_RULES[lang] },
    { role: "user", content: goal },
  ]

  const deadline = startDeadline(OLLAMA_TIMEOUTS.report, () => new OllamaTimeoutError(OLLAMA_TIMEOUTS.report))
  const signal = anySignal([opts.signal, deadline.signal])
  const turnOptions = {
    signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
    label: `agent:${label}`,
    think: false,
    numPredict: 2048,
    temperature: 0.3,
  }

  /** Terminal-tool handler: a valid submit_report call ends the run. */
  const acceptReport = (
    args: Record<string, unknown>,
    iterations: number
  ): AgentResult | string => {
    const parsed = parseSubmittedReport(args)
    if (!parsed.ok) return parsed.error
    aiLog(
      "AGENT_DONE",
      `${label}: structured report submitted (${parsed.report.findings.length} findings, ${parsed.report.actions.length} actions), ${toolCalls.length} tool calls, ${Date.now() - t0}ms`
    )
    return {
      report: structuredReportToMarkdown(parsed.report, lang),
      structured: parsed.report,
      toolCalls,
      iterations,
      ms: Date.now() - t0,
    }
  }

  try {
    for (let i = 0; i < maxIterations; i++) {
      aiLog("LLM_TURN", `${label}: iteration=${i + 1}/${maxIterations}`)
      const turn = await ollamaChatTurn(conversation, { ...turnOptions, tools: AGENT_TOOLS })

      const calls: ToolCall[] = turn.tool_calls
      if (calls.length === 0) {
        // Model ended with plain text instead of submit_report — accept it
        // as a legacy markdown report rather than burning iterations.
        aiLog("AGENT_DONE", `${label}: plain-text report ${turn.content.length} chars (no submit_report), ${toolCalls.length} tool calls, ${Date.now() - t0}ms`)
        return { report: turn.content, structured: null, toolCalls, iterations: i + 1, ms: Date.now() - t0 }
      }

      conversation.push({ role: "assistant", content: turn.content, tool_calls: calls })
      for (const call of calls) {
        const args = typeof call.function.arguments === "string"
          ? safeParse(call.function.arguments)
          : call.function.arguments
        aiLog("TOOL_CALL", `${call.function.name}(${aiLogTrunc(JSON.stringify(args ?? {}), 70)}) ← autonomous (${label})`)

        if (call.function.name === "submit_report") {
          const outcome = acceptReport((args ?? {}) as Record<string, unknown>, i + 1)
          if (typeof outcome !== "string") return outcome
          // Invalid submission: tell the model what was wrong and let it retry.
          aiLog("TOOL_RESULT", `submit_report rejected: ${outcome}`)
          conversation.push({
            role: "tool",
            content: `Error: ${outcome}. Call submit_report again with the required fields.`,
            name: call.function.name,
            tool_call_id: call.id,
          })
          continue
        }

        const ct0 = Date.now()
        const result = await runTool(call.function.name, {
          projectId,
          args: (args ?? {}) as Record<string, unknown>,
        })
        toolCalls.push({ name: call.function.name, ms: Date.now() - ct0 })
        aiLog("TOOL_RESULT", `${call.function.name} → ${result.length} chars in ${Date.now() - ct0}ms`)
        conversation.push({
          role: "tool",
          content: result + CONTINUE_FOOTER[lang],
          name: call.function.name,
          tool_call_id: call.id,
        })
      }
    }

    // Iteration budget exhausted — demand a submit_report call, nothing else.
    aiLog("LLM_TURN", `${label}: iteration budget exhausted, forcing submit_report`)
    const final = await ollamaChatTurn(
      [...conversation, { role: "system", content: FORCE_REPORT_PROMPT[lang] }],
      { ...turnOptions, tools: [SUBMIT_REPORT_TOOL] }
    )
    const submitCall = final.tool_calls.find((c) => c.function.name === "submit_report")
    if (submitCall) {
      const args = typeof submitCall.function.arguments === "string"
        ? safeParse(submitCall.function.arguments)
        : submitCall.function.arguments
      const outcome = acceptReport((args ?? {}) as Record<string, unknown>, maxIterations + 1)
      if (typeof outcome !== "string") return outcome
      aiLog("TOOL_RESULT", `submit_report rejected on forced turn: ${outcome}`)
    }
    // Last resort: whatever text the model produced becomes the report body.
    aiLog("AGENT_DONE", `${label}: report ${final.content.length} chars (forced, plain text), ${toolCalls.length} tool calls, ${Date.now() - t0}ms`)
    return { report: final.content, structured: null, toolCalls, iterations: maxIterations + 1, ms: Date.now() - t0 }
  } finally {
    deadline.clear()
  }
}

function safeParse(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}
