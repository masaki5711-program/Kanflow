import { describe, expect, it } from "vitest"
import vectors from "./signature.vectors.json"
import { computeSignature, hashSignature, normalizeFailureText, normalizeTool } from "../signature"

type Vector = { name: string; tool: string; errorCode: string | null; text: string; signatureText: string; signature: string }
const cases = vectors.cases as Vector[]
const byName = (name: string) => {
  const hit = cases.find((c) => c.name === name)
  if (!hit) throw new Error(`no vector named ${name}`)
  return hit
}

describe("signature vectors (pinned: a changed rule changes every stored signature)", () => {
  it("has at least 20 vectors", () => {
    expect(cases.length).toBeGreaterThanOrEqual(20)
  })

  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    const got = computeSignature({ tool: c.tool, errorCode: c.errorCode, text: c.text })
    expect(got.signatureText).toBe(c.signatureText)
    expect(got.signature).toBe(c.signature)
    expect(got.signature).toMatch(/^[0-9a-f]{64}$/)
  })

  it("equivalent inputs share a signature", () => {
    for (const group of vectors.equivalent) {
      const sigs = new Set(group.map((n) => byName(n).signature))
      expect(sigs.size, group.join(" / ")).toBe(1)
    }
  })

  it("different failures have different signatures", () => {
    for (const [a, b] of vectors.distinct) expect(byName(a).signature).not.toBe(byName(b).signature)
  })
})

describe("computeSignature", () => {
  it("is deterministic", () => {
    const input = { tool: "cargo", errorCode: "E0308", text: "error[E0308]: mismatched types at /home/u/x/src/a.rs:3:4" }
    expect(computeSignature(input)).toEqual(computeSignature({ ...input }))
  })

  it("the tool and the error code are part of the signature", () => {
    const text = "boom happened"
    const base = computeSignature({ tool: "a", text }).signature
    expect(computeSignature({ tool: "b", text }).signature).not.toBe(base)
    expect(computeSignature({ tool: "a", errorCode: "X-1", text }).signature).not.toBe(base)
    expect(computeSignature({ tool: "a", errorCode: "x-1", text }).signature).toBe(computeSignature({ tool: "a", errorCode: "X-1", text }).signature)
  })

  it("never lets a secret reach the signature text", () => {
    const got = computeSignature({ tool: "deploy", text: "login failed, Authorization: Bearer abcdef0123456789abcdef0123456789 sent to admin@corp.example.com" })
    expect(got.signatureText).not.toContain("abcdef0123456789")
    expect(got.signatureText).not.toContain("admin@")
  })

  it("keeps only the first three meaningful lines, each at most 300 characters", () => {
    const text = ["  ", "^^^", "alpha line", "beta line", "x".repeat(500), "delta line"].join("\n")
    const lines = normalizeFailureText(text).split("\n")
    expect(lines).toHaveLength(3)
    expect(lines[2]).toHaveLength(300)
  })

  it("hashSignature re-derives a stored signature", () => {
    const got = computeSignature({ tool: " Cargo ", errorCode: "e1", text: "something failed" })
    expect(hashSignature("cargo", "E1", got.signatureText)).toBe(got.signature)
    expect(normalizeTool("  A   B ")).toBe("a b")
  })

  it("text without a meaningful line has an empty signatureText", () => {
    expect(computeSignature({ tool: "ci", text: "\n ^^^ \n 12 34\n" }).signatureText).toBe("")
  })
})
