import { describe, expect, it } from "vitest"
import { lessonRuleSchema, parseLessonRule, plainNameSchema, PlanRuleError } from "../rules"

const ok = (input: unknown) => lessonRuleSchema.safeParse(input).success

describe("lesson rule schemas (plan 12 §2.3 bounds)", () => {
  it("scale_duration factor is 0.5-3.0", () => {
    expect(ok({ id: "r", state: "confirmed", kind: "scale_duration", params: { key: "a", factor: 0.5 } })).toBe(true)
    expect(ok({ id: "r", state: "confirmed", kind: "scale_duration", params: { key: "a", factor: 3 } })).toBe(true)
    expect(ok({ id: "r", state: "confirmed", kind: "scale_duration", params: { key: "a", factor: 0.49 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "scale_duration", params: { key: "a", factor: 3.01 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "scale_duration", params: { key: "a", factor: Number.NaN } })).toBe(false)
  })

  it("add_buffer days are whole days 1-30", () => {
    expect(ok({ id: "r", state: "confirmed", kind: "add_buffer", params: { afterKey: "a", days: 1 } })).toBe(true)
    expect(ok({ id: "r", state: "confirmed", kind: "add_buffer", params: { afterKey: "a", days: 30 } })).toBe(true)
    expect(ok({ id: "r", state: "confirmed", kind: "add_buffer", params: { afterKey: "a", days: 0 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "add_buffer", params: { afterKey: "a", days: 31 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "add_buffer", params: { afterKey: "a", days: 1.5 } })).toBe(false)
  })

  it("split parts are 2-4 and cap_parallel max is 1-5", () => {
    expect(ok({ id: "r", state: "confirmed", kind: "split", params: { key: "a", parts: 1 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "split", params: { key: "a", parts: 5 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "split", params: { key: "a", parts: 4 } })).toBe(true)
    expect(ok({ id: "r", state: "confirmed", kind: "cap_parallel", params: { role: "qa", max: 0 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "cap_parallel", params: { role: "qa", max: 6 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "cap_parallel", params: { role: "qa", max: 5 } })).toBe(true)
  })

  it("add_prerequisite needs a valid key, a plain name of at most 80 chars and bounded numbers", () => {
    const rule = (params: object) => ({ id: "r", state: "draft", kind: "add_prerequisite", params: { beforeKey: "a", newKey: "check", name: "見積の確認", durationDays: 2, ...params } })
    expect(ok(rule({}))).toBe(true)
    expect(ok(rule({ role: "qa", load: 0.5 }))).toBe(true)
    expect(ok(rule({ newKey: "has space" }))).toBe(false)
    expect(ok(rule({ name: "x".repeat(81) }))).toBe(false)
    expect(ok(rule({ load: 1.5 }))).toBe(false)
    expect(ok(rule({ durationDays: 0 }))).toBe(false)
    expect(ok(rule({ role: "bad role" }))).toBe(false)
  })

  it("refuses unknown kinds, states and extra fields", () => {
    expect(ok({ id: "r", state: "confirmed", kind: "rewrite_plan", params: {} })).toBe(false)
    expect(ok({ id: "r", state: "approved", kind: "split", params: { key: "a", parts: 2 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "split", params: { key: "a", parts: 2, ownerId: "u1" } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "split", params: { key: "a", parts: 2 }, extra: 1 })).toBe(false)
  })
})

describe("plainNameSchema", () => {
  it.each([
    ["line break", "a\nb"],
    ["control", "a\u0007b"],
    ["markup", "<b>x</b>"],
    ["markdown link", "[x](y)"],
    ["entity", "a &amp; b"],
    ["url", "see https://example.local"],
    ["www", "www.example.local"],
    ["empty", "   "],
  ])("refuses %s", (_label, name) => {
    expect(plainNameSchema.safeParse(name).success).toBe(false)
  })

  it("accepts and trims plain Japanese / English text", () => {
    expect(plainNameSchema.parse("  治具の事前確認 (QA)  ")).toBe("治具の事前確認 (QA)")
  })
})

describe("parseLessonRule", () => {
  it("returns the parsed rule", () => {
    expect(parseLessonRule({ id: "r1", state: "confirmed", kind: "split", params: { key: "a", parts: 2 } })).toMatchObject({ kind: "split" })
  })

  it("throws PLAN_RULE_INVALID with the failing path", () => {
    try {
      parseLessonRule({ id: "r1", state: "confirmed", kind: "split", params: { key: "a", parts: 9 } })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(PlanRuleError)
      expect((err as PlanRuleError).code).toBe("PLAN_RULE_INVALID")
      expect((err as Error).message).toContain("params.parts")
    }
  })
})
