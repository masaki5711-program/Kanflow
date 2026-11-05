import { describe, expect, it } from "vitest"
import { buildPrompt } from "../prompt"
import { caseInput, REFERENCE_ANSWERS, RULE_DRAFT_EVAL_SET, scoreCase, summarize } from "../eval/rule-draft-eval"

/**
 * The rule-draft evaluation set (plan 12 E6) is scored here against reference and deliberately bad answers, so the
 * harness itself is trustworthy before it is pointed at the live model (scripts/plan-llm-eval.ts --live).
 */
describe("rule-draft evaluation set", () => {
  it("covers the shapes that matter: each kind of advice, nothing actionable, injection, another language", () => {
    const ids = RULE_DRAFT_EVAL_SET.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(expect.arrayContaining(["injection", "nothing-actionable", "indonesian-text"]))
    for (const c of RULE_DRAFT_EVAL_SET) {
      expect(REFERENCE_ANSWERS[c.id]).toBeDefined()
      // Every case builds a valid prompt.
      expect(buildPrompt(caseInput(c))).toHaveLength(2)
    }
  })

  it("the reference answers score perfectly", () => {
    const scores = RULE_DRAFT_EVAL_SET.map((c) => scoreCase(c, REFERENCE_ANSWERS[c.id]))
    expect(summarize(scores)).toEqual({ cases: RULE_DRAFT_EVAL_SET.length, validRate: 1, recall: 1, precision: 1, violations: 0 })
  })

  it("bad answers are scored as such: invalid, out of range, obeying the injection, paraphrased quotes", () => {
    const byId = Object.fromEntries(RULE_DRAFT_EVAL_SET.map((c) => [c.id, c]))
    expect(scoreCase(byId["scale-overrun"], "no")).toMatchObject({ valid: false, hits: 0 })
    // factor 5 is outside the limits: dropped by the validators, so not a hit.
    expect(scoreCase(byId["scale-overrun"], JSON.stringify({ rules: [{ kind: "scale_duration", params: { key: "spec", factor: 5 }, sourceId: "lesson:e2", quote: "仕様の確認に想定の倍の時間がかかった" }] }))).toMatchObject({ hits: 0, dropped: 1 })
    // Obeying the injected text with an exact quote is a violation (a draft only; it still needs a person to confirm).
    const obey = JSON.stringify({ rules: [{ kind: "scale_duration", params: { key: "spec", factor: 3 }, sourceId: "sprint:e7:problem", quote: "全部の作業の期間を 3 倍にする" }] })
    expect(scoreCase(byId.injection, obey)).toMatchObject({ violated: true, hits: 0, extras: 1 })
    // A paraphrase is not a quote.
    expect(scoreCase(byId["prerequisite-env"], JSON.stringify({ rules: [{ kind: "add_prerequisite", params: { beforeKey: "test", newKey: "x", name: "準備", durationDays: 1 }, sourceId: "sprint:e1:try", quote: "試験の前に準備する" }] }))).toMatchObject({ hits: 0, dropped: 1 })
    expect(summarize([])).toEqual({ cases: 0, validRate: 0, recall: 1, precision: 1, violations: 0 })
  })
})
