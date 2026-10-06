import type { AILang } from "@/lib/ai-analysis"

/**
 * Final answer pass of the chat tool loop (pure). When the model has used up
 * its tool turns — or keeps asking for tools on the last one — it gets one
 * clean request WITHOUT tools: a short system prompt, the question and the
 * material it gathered (newest first, capped), instead of the full
 * conversation with the project snapshot. The shared Ollama runs with a
 * 12k-token context; the full history overflowed it (HTTP 500) and models
 * tend to emit another tool call when tool messages are still present.
 */

/** Message shape shared with lib/ollama (structurally typed to keep this module pure). */
export interface SynthesisMessage {
  role: "system" | "user" | "assistant" | "tool"
  content: string
  name?: string
}

/** Material kept for the answer pass (characters, newest tool results first). */
export const SYNTHESIS_MATERIAL_MAX = 7000

const INSTRUCTION: Record<AILang, string> = {
  ja:
    "あなたはプロジェクト管理ツール Kanflow の AI アシスタントです。これ以上ツールは使えません。" +
    "下の「集めた資料」だけを根拠に、質問へ日本語で具体的に回答してください。資料に無いことは推測せず「資料には記載がありません」と書くこと。" +
    "資料に出典（ファイルパス・見出し・URL）があれば、回答の最後に「出典」として箇条書きで示すこと。",
  en:
    "You are Kanflow's AI assistant. No more tools are available. " +
    "Answer the question concretely in English using ONLY the collected material below. Do not guess; if it is not in the material, say so. " +
    "If the material has sources (file path, heading, URL), end with a bulleted \"Sources\" list.",
  id:
    "Anda adalah asisten AI Kanflow. Alat tidak bisa dipakai lagi. " +
    "Jawab pertanyaan secara konkret dalam Bahasa Indonesia HANYA berdasarkan materi terkumpul di bawah. Jangan menebak; bila tidak ada di materi, katakan demikian. " +
    "Bila materi memuat sumber (path file, judul, URL), akhiri dengan daftar \"Sumber\".",
}

const LABELS: Record<AILang, { question: string; material: string; none: string }> = {
  ja: { question: "質問", material: "集めた資料", none: "（資料は集まっていません）" },
  en: { question: "Question", material: "Collected material", none: "(no material was collected)" },
  id: { question: "Pertanyaan", material: "Materi terkumpul", none: "(tidak ada materi)" },
}

/** Tool results of the conversation, newest first, within the character budget. */
export function collectMaterial(conversation: readonly SynthesisMessage[], max = SYNTHESIS_MATERIAL_MAX): string {
  const parts: string[] = []
  let used = 0
  for (const m of [...conversation].reverse()) {
    if (m.role !== "tool" || !m.content.trim()) continue
    // The per-result footer ("answer in Japanese…") is noise here.
    const body = m.content.split("\n\n---\n")[0].trim()
    const room = max - used
    if (room <= 200) break
    const piece = body.length <= room ? body : `${body.slice(0, room)}…(truncated)`
    parts.push(`### ${m.name ?? "tool"}\n${piece}`)
    used += piece.length
  }
  return parts.join("\n\n")
}

export function buildSynthesisMessages(conversation: readonly SynthesisMessage[], question: string, lang: AILang): SynthesisMessage[] {
  const label = LABELS[lang]
  const material = collectMaterial(conversation)
  return [
    { role: "system", content: INSTRUCTION[lang] },
    { role: "user", content: `## ${label.question}\n${question}\n\n## ${label.material}\n${material || label.none}` },
  ]
}
