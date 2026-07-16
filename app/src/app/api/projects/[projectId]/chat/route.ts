import { z } from "zod"
import { NextResponse } from "next/server"
import { requireProjectMember } from "@/lib/api-helpers"
import { ollamaChatStreamWithTools, detectLang, type ChatMessage } from "@/lib/ollama"
import { buildProjectContext, CHAT_SYSTEM_PROMPT } from "@/lib/project-context"
import { normalizeLang, type AILang } from "@/lib/ai-analysis"
import { CHAT_TOOLS, runTool } from "@/lib/chat-tools"
import { aiLog, aiLogTrunc } from "@/lib/ai-monitor"

const LANG_LOCK: Record<AILang, string> = {
  ja:
    "## 応答言語の絶対ルール\n" +
    "- 必ず **日本語のみ** で回答してください。\n" +
    "- インドネシア語や英語に切り替えてはいけません。固有名詞・コマンド・コード以外は日本語で書く。\n" +
    "- **ツール結果（ファイル本文・データ）が他の言語で書かれていても、要約・説明・回答は必ず日本語で書く。** 原文の短い引用のみ元言語を許可。\n" +
    "- 翻訳例の提示を求められた場合のみ他言語を含めても構いません。",
  id:
    "## ATURAN MUTLAK BAHASA BALASAN\n" +
    "- Anda WAJIB menjawab **hanya dalam Bahasa Indonesia**.\n" +
    "- Jangan beralih ke bahasa Jepang atau Inggris. Selain nama diri, perintah, atau kode, gunakan Bahasa Indonesia.\n" +
    "- **Meskipun hasil alat (isi file/data) ditulis dalam bahasa lain, ringkasan dan jawaban WAJIB dalam Bahasa Indonesia.** Hanya kutipan singkat yang boleh memakai bahasa asli.\n" +
    "- Bahasa lain hanya diizinkan jika pengguna secara eksplisit meminta contoh terjemahan.",
  en:
    "## OUTPUT LANGUAGE RULE (STRICT)\n" +
    "- Reply **only in English**.\n" +
    "- Do not switch to Japanese or Indonesian. Use English for everything except proper nouns, commands, and code.\n" +
    "- **Even when tool results (file contents/data) are written in another language, summaries and answers MUST be in English.** Only short quotations may keep the original language.\n" +
    "- Translation samples in other languages are allowed only when the user explicitly asks for them.",
}

// Footer appended to each tool result. Long tool output (e.g. an Indonesian
// document) pulls the model toward that language, so we close every result
// with a continuation instruction in the reply language. Embedded in the tool
// message itself — a separate trailing system message would break the task
// flow (the model treats it as a new turn and forgets the pending request).
const TOOL_RESULT_FOOTER: Record<AILang, string> = {
  ja: "\n\n---\n(注) 上記はツールの参照データです。この内容を根拠として、ユーザーの依頼（要約・質問への回答など）を続けてください。回答は必ず日本語で書くこと。",
  id: "\n\n---\n(CATATAN) Di atas adalah data referensi dari alat. Lanjutkan permintaan pengguna (ringkasan, jawaban, dll.) berdasarkan konten ini. Jawaban WAJIB dalam Bahasa Indonesia.",
  en: "\n\n---\n(NOTE) The above is reference data from the tool. Continue the user's request (summary, answer, etc.) based on this content. The answer MUST be written in English.",
}

const TOOL_GUIDE: Record<AILang, string> = {
  ja:
    "## ツール利用ガイド\n" +
    "### ファイル参照\n" +
    "- 添付ファイルの要約・引用は、まず `list_attachments` で `attachment_id` を特定し、`extract_attachment_content` で本文を取得する。内容の捏造は禁止。\n" +
    "### データ分析（進捗・工数・履歴などの質問）\n" +
    "- スプリントの進捗・遅れ・停滞 → `get_sprint_metrics`\n" +
    "- ベロシティ推移・次スプリントのキャパ目安 → `get_velocity_history`\n" +
    "- バックログの状況・PBIの品質（記入漏れ） → `get_backlog_summary`\n" +
    "- 担当者ごとの負荷・偏り → `get_member_workload`\n" +
    "- 「◯◯の件はどうなってる？」など項目の特定 → `search_work_items`\n" +
    "- 最近のデイリースクラム・困りごと → `get_daily_scrum_summary`\n" +
    "- バックログ項目の一覧・列挙 → `list_backlog_items`\n" +
    "- SP見積の妥当性判断・見積の参考実績 → `get_estimation_reference`\n" +
    "### 数値の絶対ルール（捏造防止）\n" +
    "- 件数・ポイント・割合・日数などの数値は **必ず上記ツールの結果から引用** する。自分で計算・推測してはならない。\n" +
    "- ツールを呼ばずに具体的な数値を答えることを禁止する。データが無い場合は「データがありません」と答える。\n" +
    "- 回答には可能ならデータ基準日（as_of）を添える。\n" +
    "### グラフ描画\n" +
    "- ユーザーがグラフ・チャート・推移の可視化を求めたら、まず分析ツールで数値を取得し、その数値を**改変せず**に ```chart フェンスブロックの JSON として出力する。画面が自動でグラフ描画する。\n" +
    '- 形式: ```chart\\n{"type":"bar","title":"タイトル","x":"name","series":[{"key":"value","label":"凡例名"}],"data":[{"name":"項目A","value":8}]}\\n```\n' +
    "- type は bar / line / pie。pie は x が名前キー、series[0].key が値キー。series は複数可（bar/line）。\n" +
    "- チャートの前後に、数値の要点を1〜2文で添えること。",
  en:
    "## TOOL USE GUIDE\n" +
    "### File reference\n" +
    "- For attached files, call `list_attachments` to find the `attachment_id`, then `extract_attachment_content`. Never invent file content.\n" +
    "### Data analysis (progress / workload / history questions)\n" +
    "- Sprint progress, delays, stalled work → `get_sprint_metrics`\n" +
    "- Velocity trend, capacity hint for next sprint → `get_velocity_history`\n" +
    "- Backlog status and PBI quality gaps → `get_backlog_summary`\n" +
    "- Per-member load balance → `get_member_workload`\n" +
    "- Locating a specific work item by topic → `search_work_items`\n" +
    "- Recent daily scrum notes / blockers → `get_daily_scrum_summary`\n" +
    "- Enumerating backlog items → `list_backlog_items`\n" +
    "- Judging / referencing story-point estimates → `get_estimation_reference`\n" +
    "### Number rule (anti-hallucination, STRICT)\n" +
    "- Every count, point, percentage, or day figure MUST be quoted from tool results. Do not compute or guess numbers yourself.\n" +
    "- Never state a concrete number without calling a tool first. If data is missing, say so.\n" +
    "- Include the data as-of date when available.\n" +
    "### Charts\n" +
    "- When the user asks for a graph/chart/visualization, first fetch numbers via an analysis tool, then emit them **unmodified** as a ```chart fenced JSON block. The UI renders it as a real chart.\n" +
    '- Format: ```chart\\n{"type":"bar","title":"Title","x":"name","series":[{"key":"value","label":"Legend"}],"data":[{"name":"Item A","value":8}]}\\n```\n' +
    "- type: bar / line / pie. For pie, x is the name key and series[0].key is the value key. Multiple series allowed for bar/line.\n" +
    "- Add a 1–2 sentence takeaway before or after the chart.",
  id:
    "## PANDUAN PENGGUNAAN ALAT\n" +
    "### Referensi file\n" +
    "- Untuk lampiran, panggil `list_attachments` untuk menemukan `attachment_id`, lalu `extract_attachment_content`. Jangan mengarang isi file.\n" +
    "### Analisis data (pertanyaan progres / beban / riwayat)\n" +
    "- Progres sprint, keterlambatan, tugas macet → `get_sprint_metrics`\n" +
    "- Tren velocity, acuan kapasitas sprint berikutnya → `get_velocity_history`\n" +
    "- Status backlog dan kualitas PBI → `get_backlog_summary`\n" +
    "- Beban kerja per anggota → `get_member_workload`\n" +
    "- Mencari item pekerjaan tertentu → `search_work_items`\n" +
    "- Catatan daily scrum terbaru / hambatan → `get_daily_scrum_summary`\n" +
    "- Menampilkan daftar item backlog → `list_backlog_items`\n" +
    "- Menilai / referensi estimasi story point → `get_estimation_reference`\n" +
    "### Aturan angka (anti-halusinasi, MUTLAK)\n" +
    "- Semua jumlah, poin, persentase, atau hari HARUS dikutip dari hasil alat. Jangan menghitung atau menebak sendiri.\n" +
    "- Jangan menyebut angka konkret tanpa memanggil alat. Jika data tidak ada, katakan demikian.\n" +
    "- Sertakan tanggal data (as_of) bila tersedia.\n" +
    "### Grafik\n" +
    "- Saat pengguna meminta grafik/chart/visualisasi, ambil angka lewat alat analisis dulu, lalu keluarkan angka itu **tanpa diubah** sebagai blok JSON ```chart. UI akan menggambarnya sebagai grafik.\n" +
    '- Format: ```chart\\n{"type":"bar","title":"Judul","x":"name","series":[{"key":"value","label":"Legenda"}],"data":[{"name":"Item A","value":8}]}\\n```\n' +
    "- type: bar / line / pie. Untuk pie, x adalah kunci nama dan series[0].key adalah kunci nilai. Multi-series diizinkan untuk bar/line.\n" +
    "- Tambahkan 1–2 kalimat kesimpulan sebelum atau sesudah grafik.",
}

const messageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(8000),
})

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(40),
  lang: z.enum(["ja", "en", "id"]).optional(),
})

const MAX_TOOL_ITERATIONS = 4

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await requireProjectMember(projectId)
  if ("error" in auth) return auth.error

  let parsed
  try {
    const json = await request.json()
    parsed = bodySchema.parse(json)
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 })
  }

  const context = await buildProjectContext(projectId)

  const lastUserMsg = [...parsed.messages].reverse().find((m) => m.role === "user")
  // Base language = app UI setting (sent by the client); heuristic fallback.
  let replyLang: AILang
  if (parsed.lang) {
    replyLang = normalizeLang(parsed.lang)
  } else {
    replyLang = lastUserMsg ? detectLang(lastUserMsg.content) : "ja"
  }
  // Question language wins when unambiguous: a question containing Japanese
  // characters is answered in Japanese even if the UI is set to en/id.
  if (lastUserMsg && detectLang(lastUserMsg.content) === "ja") {
    replyLang = "ja"
  }

  aiLog("CHAT_START", `lang=${replyLang} history=${parsed.messages.length} Q="${aiLogTrunc(lastUserMsg?.content, 90)}"`)
  aiLog("CONTEXT", `project snapshot ${context.length} chars injected into system prompt`)

  const baseMessages: ChatMessage[] = [
    { role: "system", content: CHAT_SYSTEM_PROMPT },
    { role: "system", content: `# プロジェクト現状\n\n${context}` },
    { role: "system", content: LANG_LOCK[replyLang] },
    { role: "system", content: TOOL_GUIDE[replyLang] },
    ...parsed.messages,
  ]

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      const ac = new AbortController()
      const timeout = setTimeout(() => ac.abort(), 240_000)
      const conversation = [...baseMessages]
      const chatT0 = Date.now()
      // Demo monitor: flag chart/table generation once per chat so the
      // console shows a [図表] event (rendering itself happens client-side).
      let chartLogged = false
      let tableLogged = false
      try {
        // Tool-calling loop with true token streaming. Each turn streams text
        // chunks to the client in real time; if the model produces tool_calls
        // we execute them and re-enter the stream for the next turn.
        for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
          let textBuf = ""
          let toolCalls: import("@/lib/ollama").ToolCall[] = []
          // Demo monitor: log streaming progress in coarse slices, not per token.
          let sliceStart = 0
          let firstToken = true
          aiLog("LLM_TURN", `iteration=${i + 1}/${MAX_TOOL_ITERATIONS} waiting for local model…`)
          const turnT0 = Date.now()

          for await (const event of ollamaChatStreamWithTools(conversation, {
            signal: ac.signal,
            think: false,
            tools: CHAT_TOOLS,
            numCtx: 8192,
            numPredict: 4096,
          })) {
            if (event.type === "text") {
              if (firstToken) {
                firstToken = false
                aiLog("LLM_FIRST_TOK", `first token after ${Date.now() - turnT0}ms`)
              }
              textBuf += event.chunk
              controller.enqueue(encoder.encode(event.chunk))
              if (!chartLogged && textBuf.includes("```chart")) {
                chartLogged = true
                aiLog("VIZ_CHART", "chart JSON を生成中 → 画面側で Recharts がグラフ描画（数値はツール結果から転記）")
              }
              if (!tableLogged && /\n\|[^\n]+\|\r?\n\|[ :\-|]+\|/.test(textBuf)) {
                tableLogged = true
                aiLog("VIZ_TABLE", "Markdown 表を生成中 → 画面側でテーブル描画")
              }
              if (textBuf.length - sliceStart >= 240) {
                aiLog("LLM_OUTPUT", `…${aiLogTrunc(textBuf.slice(sliceStart), 100)}`)
                sliceStart = textBuf.length
              }
            } else if (event.type === "tool_calls") {
              toolCalls = event.calls
            }
          }

          if (toolCalls.length === 0) {
            aiLog("CHAT_DONE", `answer ${textBuf.length} chars, total ${Date.now() - chatT0}ms`)
            return // streamed text was the final reply
          }

          // Surface a tiny status hint so the user knows a tool is running
          // (otherwise the chat would appear frozen for several seconds).
          const toolNames = toolCalls.map((c) => c.function.name).join(", ")
          controller.enqueue(encoder.encode(`\n\n_🔧 ${toolNames}_\n\n`))

          conversation.push({
            role: "assistant",
            content: textBuf,
            tool_calls: toolCalls,
          })
          for (const call of toolCalls) {
            const args =
              typeof call.function.arguments === "string"
                ? safeParseJson(call.function.arguments)
                : call.function.arguments
            aiLog("TOOL_CALL", `${call.function.name}(${aiLogTrunc(JSON.stringify(args ?? {}), 80)})  ← model decided to use this tool`)
            const toolT0 = Date.now()
            const result = await runTool(call.function.name, {
              projectId,
              args: (args ?? {}) as Record<string, unknown>,
            })
            aiLog("TOOL_RESULT", `${call.function.name} → ${result.length} chars in ${Date.now() - toolT0}ms (fed back to model)`)
            conversation.push({
              role: "tool",
              content: result + TOOL_RESULT_FOOTER[replyLang],
              name: call.function.name,
              tool_call_id: call.id,
            })
          }
        }

        aiLog("CHAT_LIMIT", `tool iteration limit (${MAX_TOOL_ITERATIONS}) reached`)
        controller.enqueue(
          encoder.encode(
            "\n\n[error] tool iteration limit reached; please rephrase your question"
          )
        )
      } catch (err) {
        const message = err instanceof Error ? err.message : "stream_error"
        aiLog("CHAT_ERROR", message)
        controller.enqueue(encoder.encode(`\n\n[error] ${message}`))
      } finally {
        clearTimeout(timeout)
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  })
}

function safeParseJson(s: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(s)
    return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null
  } catch {
    return null
  }
}
