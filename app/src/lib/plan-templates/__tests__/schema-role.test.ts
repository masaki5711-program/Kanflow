import { describe, expect, it } from "vitest"
import { TEMPLATE_ROLE_PATTERN, templateContentSchema } from "../schema"

describe("template stage role", () => {
  it("accepts a short identifier like a base schedule's role", () => {
    expect(templateContentSchema.safeParse({ stages: [{ name: "設計", role: "design" }, { name: "製作", role: "build_2-a" }] }).success).toBe(true)
    expect(templateContentSchema.safeParse({ stages: [{ name: "x" }] }).success).toBe(true)
  })

  it("refuses spaces, non-ASCII, more than 32 characters, an empty string and the reserved __ prefix", () => {
    for (const role of ["bad role", "設計", "x".repeat(33), "", "__system"]) {
      expect(templateContentSchema.safeParse({ stages: [{ name: "x", role }] }).success, role).toBe(false)
      expect(TEMPLATE_ROLE_PATTERN.test(role), role).toBe(false)
    }
  })
})
