import { buildAnalysisSystem, analysisStreamResponse, type AILang } from "@/lib/ai-analysis"
import type { ChatMessage } from "@/lib/ollama"
import { OLLAMA_TIMEOUTS } from "@/lib/ollama/config"

/** AI summary of a merged-MR list (a sprint's or a version's release note), streamed. */
const INSTRUCTIONS: Record<AILang, string> = {
  ja: `次は対象期間（スプリントまたはリリース）にマージされたマージリクエスト（MR）の一覧です。スプリントレビューやリリース報告で使う成果の要約を書いてください。

## 出力フォーマット（厳守）
### 今回できるようになったこと
- 利用者・関係者の視点で 3〜5 件。技術用語は避け、PBI ごとの価値を書く

### 技術的なトピック
- 開発者向けに 2〜3 件（大きな変更、リスク、次に効く改善など）

提供された MR の範囲のみで書き、推測や捏造をしないでください。`,
  en: `Below are the merge requests (MRs) merged during the period (a sprint or a release). Write an outcome summary for the sprint review or the release report.

## Output Format (strict)
### What users can do now
- 3–5 bullets from the users' / stakeholders' point of view, avoiding jargon, one value per PBI

### Technical notes
- 2–3 bullets for developers (big changes, risks, improvements that help next)

Use only the MRs provided; do not speculate or fabricate.`,
  id: `Berikut adalah merge request (MR) yang di-merge selama periode (sprint atau rilis). Tulis ringkasan hasil untuk sprint review atau laporan rilis.

## Format Output (wajib)
### Yang kini bisa dilakukan pengguna
- 3–5 poin dari sudut pandang pengguna/pemangku kepentingan, hindari jargon, satu nilai per PBI

### Catatan teknis
- 2–3 poin untuk pengembang (perubahan besar, risiko, perbaikan yang membantu berikutnya)

Gunakan hanya MR yang diberikan; jangan berspekulasi atau mengarang.`,
}

export function releaseSummaryResponse(noteText: string, lang: AILang, signal: AbortSignal): Promise<Response> {
  const messages: ChatMessage[] = [
    { role: "system", content: buildAnalysisSystem(INSTRUCTIONS[lang], lang) },
    { role: "user", content: noteText },
  ]
  return analysisStreamResponse(messages, { temperature: 0.3, label: "release-summary", signal, timeoutMs: OLLAMA_TIMEOUTS.report })
}
