import { OLLAMA_BASE_URL, OLLAMA_MODELS, ollamaGenerate } from "@/lib/ollama"
import { detectLocale } from "./detect-locale"
import { glossaryMisses } from "./glossary-markup"
import { protectMentions, restoreMentions } from "./protect-mentions"
import type { GlossaryTerm, TranslationLocale } from "./types"

/**
 * One-direction translation between Japanese, Indonesian and English with
 * glossary enforcement.
 *
 * Used both by the background worker (`background: true`, preemptible) and
 * by the "translate now" endpoint (high priority). The model is asked to
 * use every glossary translation; if any is missing from the output the
 * prompt is re-issued once with a stronger instruction, and the remaining
 * misses are reported back to the caller. @mentions are replaced by
 * placeholders before the model sees the text and restored verbatim after.
 */

/** Upper bound on generated tokens: translations are about input-length. */
export const MAX_NUM_PREDICT = 1536

export function numPredictFor(text: string): number {
  return Math.min(MAX_NUM_PREDICT, text.length * 3 + 64)
}

export interface TranslateInput {
  text: string
  sourceLocale?: TranslationLocale
  targetLocale: TranslationLocale
  glossary?: GlossaryTerm[]
}

export interface TranslateResult {
  translated: string
  sourceLocale: TranslationLocale
  targetLocale: TranslationLocale
  modelUsed: string
  glossaryApplied: number
  glossaryMisses: string[]
}

const SYSTEM_PROMPT = `あなたは Yamaha YMMA 工場の生産技術・プロジェクト管理ドキュメントを日本語・Bahasa Indonesia・English の間で翻訳する専門翻訳者です。

ルール:
- 製造現場の専門用語 (例: SMT / 治具 / poka-yoke / dekok) は適切に対訳する
- 固有名詞 (型番、製品コード、ライン名、機械名、人名) はそのまま保持する
- 略語 (NG / WW / OQC / FA / IQC / PBI / SP など) はそのまま保持する
- 翻訳結果のみを返す。前置き・解説・引用符・マークダウンは不要
- 改行は元のまま保持する
- {{M0}} {{M1}} のような {{M数字}} 形式のプレースホルダーは翻訳せず、そのままの表記で訳文の適切な位置に残す`

const LOCALE_LABEL: Record<TranslationLocale, string> = { ja: "日本語", id: "Bahasa Indonesia", en: "English" }

function glossaryBlock(glossary: GlossaryTerm[], strong: boolean): string {
  if (glossary.length === 0) return ""
  const rules = glossary.map((g) => `  - ${g.term} → ${g.translation}`).join("\n")
  const head = strong
    ? "【厳守】次の用語は例外なく、必ずこの訳語をそのまま (表記を変えずに) 使うこと。他の言い換え・省略は不可:\n"
    : "次の用語は必ずこの訳語を使う (用語 → 訳語):\n"
  return `\n${head}${rules}\n`
}

function userPrompt(
  text: string,
  source: TranslationLocale,
  target: TranslationLocale,
  glossary: GlossaryTerm[],
  strong: boolean
): string {
  const srcLabel = LOCALE_LABEL[source]
  const tgtLabel = LOCALE_LABEL[target]
  return `次の ${srcLabel} のテキストを ${tgtLabel} に翻訳してください。翻訳結果だけを返してください。
${glossaryBlock(glossary, strong)}
----
${text}
----`
}

function cleanOutput(out: string): string {
  return out
    .replace(/^\s*----\s*/, "")
    .replace(/\s*----\s*$/, "")
    .replace(/^["「『]|["」』]$/g, "")
    .trim()
}

export async function translateText(
  input: TranslateInput,
  opts: { signal?: AbortSignal; background?: boolean } = {}
): Promise<TranslateResult> {
  const text = input.text.trim()
  const source = input.sourceLocale ?? detectLocale(text)
  const target = input.targetLocale
  const model = OLLAMA_MODELS.translate
  if (!text) {
    return { translated: "", sourceLocale: source, targetLocale: target, modelUsed: "(empty)", glossaryApplied: 0, glossaryMisses: [] }
  }
  if (source === target) {
    return { translated: text, sourceLocale: source, targetLocale: target, modelUsed: "(noop)", glossaryApplied: 0, glossaryMisses: [] }
  }
  const glossary = input.glossary ?? []
  const shielded = protectMentions(text)
  const generate = async (strong: boolean, temperature: number) => {
    const raw = await ollamaGenerate(userPrompt(shielded.text, source, target, glossary, strong), {
      system: SYSTEM_PROMPT,
      temperature,
      numPredict: numPredictFor(text),
      signal: opts.signal,
      background: opts.background,
      role: "translate",
      think: false,
    })
    return restoreMentions(cleanOutput(raw), shielded.tokens)
  }

  let out = await generate(false, 0.2)
  let misses = glossaryMisses(out, glossary)
  if (misses.length > 0) {
    // One retry with the strong instruction; keep it only if it is not worse.
    const retry = await generate(true, 0)
    const retryMisses = glossaryMisses(retry, glossary)
    if (retryMisses.length <= misses.length && retry.length > 0) {
      out = retry
      misses = retryMisses
    }
  }
  return {
    translated: out,
    sourceLocale: source,
    targetLocale: target,
    modelUsed: model,
    glossaryApplied: glossary.length - misses.length,
    glossaryMisses: misses,
  }
}

/** Cheap reachability probe for the admin status panel. */
export async function ollamaReachable(timeoutMs = 2000): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/version`, { signal: AbortSignal.timeout(timeoutMs) })
    return res.ok
  } catch {
    return false
  }
}
