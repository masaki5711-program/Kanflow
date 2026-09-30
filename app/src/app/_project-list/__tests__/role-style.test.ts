import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { describe, expect, it } from "vitest"
import { roleStyle } from "../types"

describe("member role chips (P-10 colour contrast)", () => {
  it("use kit tokens with strong text instead of raw palette colours", () => {
    expect(roleStyle.po).toContain("text-warning-strong")
    expect(roleStyle.sm).toContain("text-success-strong")
    expect(roleStyle.dev).toContain("text-fg-muted")
    for (const cls of Object.values(roleStyle)) {
      expect(cls).not.toMatch(/\b(amber|emerald|slate)-/)
    }
  })

  it("never fade chip text with opacity (axe: 4.02:1 on the role label)", () => {
    const card = readFileSync(resolve(__dirname, "../project-card.tsx"), "utf8")
    const archived = readFileSync(resolve(__dirname, "../archived-section.tsx"), "utf8")
    expect(card).not.toMatch(/className="opacity-\d+"/)
    expect(archived).not.toMatch(/opacity-\d+/)
  })
})
