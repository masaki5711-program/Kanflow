import { describe, expect, it } from "vitest"
import { en, id, ja } from "@/lib/i18n/plan-lesson-rules"
import { ruleKindLabel, ruleSummary } from "../describe"

describe("ruleSummary", () => {
  it("puts every number of every kind into the sentence (the confirmer reads them)", () => {
    expect(ruleSummary("scale_duration", { key: "test", factor: 1.5 }, ja)).toBe("「test」の期間の見積もりに ×1.5 を掛ける")
    expect(ruleSummary("add_buffer", { afterKey: "accept", days: 3 }, ja)).toBe("「accept」の後に 3 日の余裕を入れる")
    expect(ruleSummary("add_prerequisite", { beforeKey: "build", newKey: "review", name: "レビュー", durationDays: 2 }, ja)).toBe("「build」の前に「レビュー」（2 日）を足す")
    expect(ruleSummary("add_dependency", { from: "a", to: "b" }, en, "en-US")).toBe("Start “b” only after “a” is finished")
    expect(ruleSummary("split", { key: "impl", parts: 3 }, en, "en-US")).toBe("Split “impl” into 3 parts")
    // No "1 days" / "1 items": the English sentences avoid a plural that depends on the number.
    expect(ruleSummary("cap_parallel", { role: "qa", max: 1 }, en, "en-US")).toBe("Role “qa”: at most 1 in progress at a time")
    expect(ruleSummary("add_prerequisite", { beforeKey: "b", newKey: "n", name: "Review", durationDays: 1 }, en, "en-US")).toBe("Add a 1-day item “Review” before “b”")
  })

  it("writes numbers for the locale (Indonesian uses a decimal comma, like the form accepts)", () => {
    expect(ruleSummary("scale_duration", { key: "test", factor: 0.5 }, id, "id-ID")).toBe("Kalikan perkiraan durasi “test” dengan ×0,5")
    expect(ruleSummary("scale_duration", { key: "test", factor: 1.25 }, en, "en-US")).toContain("×1.25")
  })

  it("falls back to the kind label for malformed params or an unknown kind", () => {
    expect(ruleSummary("add_buffer", { afterKey: "a", days: 99 }, ja)).toBe(ja.plrKindAddBuffer)
    expect(ruleSummary("rewrite", {}, ja)).toBe("rewrite")
    expect(ruleKindLabel("split", en)).toBe(en.plrKindSplit)
  })
})
