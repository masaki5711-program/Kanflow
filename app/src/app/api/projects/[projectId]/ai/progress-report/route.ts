import { z } from "zod"
import { requireProject } from "@/lib/authz"
import { buildAnalysisSystem, analysisStreamResponse, normalizeLang, type AILang } from "@/lib/ai-analysis"
import { buildProjectContext } from "@/lib/project-context"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"

/**
 * Stakeholder progress report — structured AND streamed.
 *
 * The model is grammar-constrained to JSON (Ollama format:"json") and writes
 * a StructuredReport-shaped object (the same schema the autonomous agent
 * submits through the submit_report tool). The raw JSON tokens are streamed
 * to the client, which incrementally parses them (streaming-json-array.ts)
 * and live-renders the formal report document section by section — the user
 * watches the report being written instead of staring at a spinner.
 */

const bodySchema = z.object({ lang: z.enum(["ja", "en", "id"]).optional() }).optional()

const SCHEMA_SPEC = `{
  "headline": string,
  "overview": string,
  "findings": [{ "severity": "info"|"warning"|"critical", "title": string, "detail": string }],
  "metrics": [{ "label": string, "value": string }],
  "causes": [string],
  "actions": [{ "priority": "high"|"medium"|"low", "action": string }],
  "outlook": string
}`

const INSTRUCTIONS: Record<AILang, string> = {
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params
  const auth = await requireProject(projectId, "ai.use")
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

  return analysisStreamResponse(messages, {
    temperature: 0.4,
    format: "json",
    numPredict: 2048,
    label: "progress-report",
    signal: request.signal,
    timeoutMs: OLLAMA_TIMEOUTS.report,
  })
}
