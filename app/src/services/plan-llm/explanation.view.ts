/**
 * What a reader sees of a run's AI explanation (plan 12 §3.4 "説明の文", §4 last-line guard). Pure.
 *
 * The text is shown only when the reader can view EVERY source id the LLM was given (llmSourceIds) and no source of
 * the run has become unusable since (a source that turned confidential must not keep speaking through the text).
 * Otherwise the reader gets the deterministic table and one line "AI の説明は表示できません" (state "hidden").
 */
import type { ExplanationText } from "@/lib/plan-llm/parse"

export type ExplanationState = "ready" | "failed" | "skipped"

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
  /** The assistance is switched off (PLAN_LLM_ASSIST=off). */
  | { state: "off" }

export interface StoredExplanation {
  state: string | null
  text: unknown
  sourceIds: readonly string[]
}

function textOf(value: unknown): ExplanationText | null {
  if (typeof value !== "object" || value === null) return null
  const v = value as Record<string, unknown>
  return typeof v.ja === "string" && typeof v.en === "string" && typeof v.id === "string" ? { ja: v.ja, en: v.en, id: v.id } : null
}

export function explanationView(stored: StoredExplanation, readerCanView: (projectId: string) => boolean, stale: boolean, assistOn: boolean): ExplanationView {
  switch (stored.state) {
    case "ready": {
      const text = textOf(stored.text)
      if (!text || stale || !stored.sourceIds.every(readerCanView)) return { state: "hidden" }
      return { state: "ready", text }
    }
    case "failed":
      return { state: "failed" }
    case "skipped":
      return { state: "skipped" }
    default:
      // Not written yet: a stale run is not explained any more.
      if (!assistOn) return { state: "off" }
      return stale ? { state: "hidden" } : { state: "pending" }
  }
}
