/**
 * What a reader sees of a run's AI explanation (plan 12 §3.4 "説明の文", §4 last-line guard). Pure.
 *
 * The text is shown only when the reader can view EVERY source id the LLM was given (llmSourceIds), none of the run's
 * sources has become unusable since (a source that turned confidential must not keep speaking through the text), and
 * none of the items the text describes is withheld from this reader on the card (a source they cannot view). Otherwise
 * the reader gets the deterministic table and one line "AI の説明は表示できません" (state "hidden").
 */
import type { ExplanationText } from "@/lib/plan-llm/parse"

export type ExplanationState = "ready" | "failed" | "skipped"

/** After a failed attempt (Ollama down / slow) the next one waits this long; it also keeps two requests from racing. */
export const EXPLAIN_RETRY_AFTER_MS = 10 * 60_000

export type ExplanationView =
  | { state: "ready"; text: ExplanationText }
  /** The reader may not see every source the text was written from, or a source became unusable. */
  | { state: "hidden" }
  /** Not written yet (the screen asks for it once). */
  | { state: "pending" }
  /** The LLM did not answer usably: the deterministic part only ("AI の補助なし"). */
  | { state: "failed" }
  /** Nothing to explain. */
  | { state: "skipped" }
  /** The assistance is switched off (PLAN_LLM_ASSIST=off), or the run expired before it was explained. */
  | { state: "off" }

/** The stored explanation: { ja, en, id, keys } — keys = the plan items the text describes. */
export interface StoredExplanationText extends ExplanationText {
  keys: string[]
}

export interface StoredExplanation {
  state: string | null
  text: unknown
  sourceIds: readonly string[]
  /** Last attempt (or the time it was written). */
  attemptedAt: Date | null
}

export interface ReaderFacts {
  canView: (projectId: string) => boolean
  /** A source of the run is no longer usable (confidential, trashed, superseded). */
  stale: boolean
  /** Items whose numbers the card withholds from this reader. */
  withheld: ReadonlySet<string>
  expired: boolean
  assistOn: boolean
  now: Date
}

export function storedTextOf(value: unknown): StoredExplanationText | null {
  if (typeof value !== "object" || value === null) return null
  const v = value as Record<string, unknown>
  if (typeof v.ja !== "string" || typeof v.en !== "string" || typeof v.id !== "string") return null
  const keys = Array.isArray(v.keys) ? v.keys.filter((k): k is string => typeof k === "string") : []
  return { ja: v.ja, en: v.en, id: v.id, keys }
}

export function attemptedRecently(attemptedAt: Date | null, now: Date): boolean {
  return attemptedAt !== null && now.getTime() - attemptedAt.getTime() < EXPLAIN_RETRY_AFTER_MS
}

export function explanationView(stored: StoredExplanation, facts: ReaderFacts): ExplanationView {
  switch (stored.state) {
    case "ready": {
      const text = storedTextOf(stored.text)
      if (!text || facts.stale || !stored.sourceIds.every(facts.canView) || text.keys.some((k) => facts.withheld.has(k))) return { state: "hidden" }
      return { state: "ready", text: { ja: text.ja, en: text.en, id: text.id } }
    }
    case "failed":
      return { state: "failed" }
    case "skipped":
      return { state: "skipped" }
    default:
      if (!facts.assistOn || facts.expired) return { state: "off" }
      // A stale run is not explained any more; a recent failed attempt waits before the next one.
      if (facts.stale) return { state: "hidden" }
      return attemptedRecently(stored.attemptedAt, facts.now) ? { state: "failed" } : { state: "pending" }
  }
}
