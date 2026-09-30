import { z } from "zod"
import { analysisJSON, buildAnalysisSystem, type AILang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"
import { parseSubmittedReport, type StructuredReport } from "@/lib/report-tool"

/**
 * Stakeholder progress report prompt — shared by the streaming endpoint
 * (POST /api/projects/:id/ai/progress-report, live-rendered in the browser)
 * and the background job (lib/ai-jobs, saved as an AiReport).
 *
 * The model is grammar-constrained to JSON (Ollama format:"json") and writes
 * a StructuredReport-shaped object (the same schema the autonomous agent
 * submits through the submit_report tool).
 */

const SCHEMA_SPEC = `{
  "headline": string,
  "overview": string,
  "findings": [{ "severity": "info"|"warning"|"critical", "title": string, "detail": string }],
  "metrics": [{ "label": string, "value": string }],
  "causes": [string],
  "actions": [{ "priority": "high"|"medium"|"low", "action": string }],
  "outlook": string
}`

export const PROGRESS_REPORT_INSTRUCTIONS: Record<AILang, string> = {
  ja: `あなたはプロジェクトマネージャーの補佐 AI です。
以下のプロジェクト情報から、ステークホルダー向けの進捗報告書を JSON オブジェクト1個のみで出力してください。JSON 以外の文章・コードフェンスは出力禁止。

## JSON スキーマ（キーはこの順で出力すること）
${SCHEMA_SPEC}

## 各フィールドの内容
- headline: プロジェクト状況の結論1文
- overview: 全体進捗と直近スプリントの成果（2〜4文）
- findings: 現在の課題・リスク（影響大=critical / 要注意=warning / 情報=info）
- metrics: 進捗率・PBI数・スプリント名・完了タスク数などの具体的数値（コンテキストから引用）
- causes: 課題の主な原因（なければ空配列）
- actions: 次のマイルストーンと推奨対応（2〜4件）
- outlook: 今後の見通し（1〜2文）

数値は必ずコンテキストから引用し、捏造しないこと。個人名は最小限に留め、メールアドレスは出力しないこと。
**すべての文字列値（headline / overview / findings / metrics / causes / actions / outlook）は必ず日本語で書くこと。英語で書いてはならない。**`,
  en: `You are an assistant AI for project managers.
From the project information below, output the stakeholder progress report as exactly ONE JSON object. No prose or code fences outside the JSON.

## JSON schema (emit keys in this order)
${SCHEMA_SPEC}

## Field contents
- headline: one-sentence conclusion on project health
- overview: overall progress and recent sprint achievements (2-4 sentences)
- findings: current issues/risks (major impact=critical / caution=warning / informational=info)
- metrics: concrete numbers quoted from the context (progress %, PBI counts, sprint name, tasks done)
- causes: main causes behind the issues (empty array if none)
- actions: next milestones and recommended moves (2-4 items)
- outlook: short outlook (1-2 sentences)

Quote every number from the context; never fabricate. Mention individuals minimally; do not output email addresses.
**Every string value (headline / overview / findings / metrics / causes / actions / outlook) MUST be written in English.**`,
  id: `Anda adalah asisten AI untuk manajer proyek.
Dari informasi proyek di bawah, keluarkan laporan progres untuk pemangku kepentingan sebagai TEPAT SATU objek JSON. Dilarang menulis teks atau pagar kode di luar JSON.

## Skema JSON (keluarkan kunci sesuai urutan ini)
${SCHEMA_SPEC}

## Isi setiap bidang
- headline: kesimpulan satu kalimat tentang kondisi proyek
- overview: progres keseluruhan dan pencapaian sprint terakhir (2-4 kalimat)
- findings: masalah/risiko saat ini (dampak besar=critical / perlu perhatian=warning / informasi=info)
- metrics: angka konkret yang dikutip dari konteks (persen progres, jumlah PBI, nama sprint, tugas selesai)
- causes: penyebab utama masalah (array kosong jika tidak ada)
- actions: tonggak berikutnya dan tindakan yang disarankan (2-4 item)
- outlook: prospek singkat (1-2 kalimat)

Kutip semua angka dari konteks; jangan mengarang. Sebutkan nama orang seminimal mungkin; jangan tampilkan alamat email.
**Semua nilai string (headline / overview / findings / metrics / causes / actions / outlook) HARUS ditulis dalam Bahasa Indonesia. Dilarang menulis dalam bahasa Inggris.**`,
}

/** Generation options shared by the stream and the job. */
export const PROGRESS_REPORT_OPTIONS = { temperature: 0.4, numPredict: 2048 } as const

/** System + user messages for the progress report of a project snapshot. */
export function buildProgressReportMessages(context: string, lang: AILang): ChatMessage[] {
  return [
    { role: "system", content: buildAnalysisSystem(PROGRESS_REPORT_INSTRUCTIONS[lang], lang) },
    { role: "user", content: context },
  ]
}

/** Report title stored on the AiReport (dashboard list). */
export const PROGRESS_REPORT_TITLE: Record<AILang, string> = {
  ja: "📊 進捗レポート",
  en: "📊 Progress report",
  id: "📊 Laporan progres",
}

/** Model JSON → StructuredReport (lenient, like submit_report); invalid output is retried by analysisJSON. */
const structuredReportSchema = z.unknown().transform((value, ctx) => {
  const parsed = value && typeof value === "object" && !Array.isArray(value)
    ? parseSubmittedReport(value as Record<string, unknown>)
    : ({ ok: false, error: "not a JSON object" } as const)
  if (!parsed.ok) {
    ctx.addIssue({ code: "custom", message: parsed.error })
    return z.NEVER
  }
  return parsed.report
})

/** Non-streaming generation for the background job (JSON validated, retried on malformed output). */
export function generateProgressReport(
  messages: ChatMessage[],
  opts: { signal?: AbortSignal; label?: string } = {}
): Promise<StructuredReport> {
  return analysisJSON(messages, structuredReportSchema, {
    temperature: PROGRESS_REPORT_OPTIONS.temperature,
    signal: opts.signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
    label: opts.label ?? "progress-report-job",
    maxRetries: 1,
  })
}
