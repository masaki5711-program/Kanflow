import { describe, expect, it } from "vitest"
import { createRuleSchema, promotionDecisionSchema, promotionRequestSchema, RULE_QUOTE_MAX } from "../lesson-rules.schemas"

const RULE = { kind: "add_buffer", params: { afterKey: "a", days: 2 } }

describe("lesson-rule request schemas", () => {
  it("normalises the quote (NFKC, CRLF → LF, trimmed; empty → null)", () => {
    expect(createRuleSchema.parse({ ...RULE, quote: "  ﾃｽﾄ\r\n２行目 " }).quote).toBe("テスト\n2行目")
    expect(createRuleSchema.parse({ ...RULE, quote: "   " }).quote).toBeNull()
  })

  it("refuses invisible / bidi / control characters in the quote, and an over-long quote", () => {
    for (const bad of ["a‮b", "a​b", "a\u0007b", "a b"]) {
      expect(createRuleSchema.safeParse({ ...RULE, quote: bad }).success).toBe(false)
    }
    expect(createRuleSchema.safeParse({ ...RULE, quote: "x".repeat(RULE_QUOTE_MAX + 1) }).success).toBe(false)
    expect(createRuleSchema.safeParse({ ...RULE, quote: "tab\tand\nnewline" }).success).toBe(true)
  })

  it("refuses a caller-chosen scope, state or creator (only drafts of the project scope are created)", () => {
    for (const extra of [{ scope: "shared" }, { state: "confirmed" }, { createdByKind: "llm" }, { lineage: "x" }]) {
      expect(createRuleSchema.safeParse({ ...RULE, ...extra }).success).toBe(false)
    }
  })

  it("a promotion request names a lineage or a project type", () => {
    expect(promotionRequestSchema.safeParse({ version: 0 }).success).toBe(false)
    expect(promotionRequestSchema.safeParse({ version: 0, lineage: "  " }).success).toBe(false)
    expect(promotionRequestSchema.safeParse({ version: 0, projectType: "software" }).success).toBe(true)
  })

  it("an admin confirm repeats the kind, the numbers and the requested reach; a reject needs only the version", () => {
    expect(promotionDecisionSchema.safeParse({ decision: "confirm", version: 1 }).success).toBe(false)
    expect(promotionDecisionSchema.safeParse({ decision: "confirm", version: 1, ...RULE }).success).toBe(false)
    expect(promotionDecisionSchema.safeParse({ decision: "confirm", version: 1, ...RULE, lineage: "template:t1", projectType: null }).success).toBe(true)
    expect(promotionDecisionSchema.safeParse({ decision: "reject", version: 1 }).success).toBe(true)
  })
})
