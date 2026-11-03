import { describe, expect, it } from "vitest"
import { lessonRuleSchema, plainNameSchema } from "../rules"

const ok = (input: unknown) => lessonRuleSchema.safeParse(input).success

describe("review fixes — schemas", () => {
  it("M1: NFKC-normalises and refuses format characters (bidi, zero-width, BOM, soft hyphen) and C1 / line separators", () => {
    for (const cp of [0x202a, 0x202e, 0x2066, 0x2069, 0x200b, 0x200f, 0xfeff, 0x00ad, 0x2028, 0x2029, 0x0085]) {
      expect(plainNameSchema.safeParse(`a${String.fromCodePoint(cp)}b`).success).toBe(false)
    }
    expect(plainNameSchema.parse("ＱＡ確認")).toBe("QA確認")
  })

  it("M1: refuses a leading URI scheme and fullwidth markup / URL forms", () => {
    for (const name of ["javascript:alert(1)", "mailto:x@example.local", "data:text/html,x", "ｊａｖａｓｃｒｉｐｔ：x", "＜b＞x", "ｈｔｔｐｓ：／／example.local", "ｗｗｗ．example.local"]) {
      expect(plainNameSchema.safeParse(name).success).toBe(false)
    }
    expect(plainNameSchema.safeParse("設計：レビュー").success).toBe(true)
  })

  it("H1: __proto__ is refused as a rule key and as a role", () => {
    expect(ok({ id: "r", state: "confirmed", kind: "scale_duration", params: { key: "__proto__", factor: 1.2 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "cap_parallel", params: { role: "__proto__", max: 2 } })).toBe(false)
    expect(ok({ id: "r", state: "confirmed", kind: "add_prerequisite", params: { beforeKey: "a", newKey: "__proto__", name: "x", durationDays: 1 } })).toBe(false)
  })

  it("M4: add_prerequisite newKey may not use the generated suffixes _pN / _bufN", () => {
    for (const newKey of ["x_p1", "x_p12", "x_buf1", "x_buf20"]) {
      expect(ok({ id: "r", state: "confirmed", kind: "add_prerequisite", params: { beforeKey: "a", newKey, name: "x", durationDays: 1 } })).toBe(false)
    }
    expect(ok({ id: "r", state: "confirmed", kind: "add_prerequisite", params: { beforeKey: "a", newKey: "x_prep", name: "x", durationDays: 1 } })).toBe(true)
  })

  it("cap_parallel max outside 1-5 or not an integer is refused", () => {
    for (const max of [0, 6, 2.5, -1]) expect(ok({ id: "r", state: "confirmed", kind: "cap_parallel", params: { role: "qa", max } })).toBe(false)
  })
})
