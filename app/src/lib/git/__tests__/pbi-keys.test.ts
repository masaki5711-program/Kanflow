import { describe, expect, it } from "vitest"
import { extractPbiNumbers, pbiKey, suggestBranchName } from "../pbi-keys"

describe("extractPbiNumbers", () => {
  it("recognizes every supported spelling, case-insensitively", () => {
    expect(extractPbiNumbers("PBI-123 pbi_45 PBI 7 PBI99")).toEqual([123, 45, 7, 99])
  })

  it("ignores a match preceded by another letter or digit (no word boundary)", () => {
    expect(extractPbiNumbers("XPBI-1 1PBI-2")).toEqual([])
  })

  it("rejects numbers longer than 7 digits (no match at all, not a truncated one)", () => {
    expect(extractPbiNumbers("PBI-12345678")).toEqual([])
  })

  it("accepts the 7-digit boundary", () => {
    expect(extractPbiNumbers("PBI-1234567")).toEqual([1234567])
  })

  it("excludes PBI-0 (number must be > 0)", () => {
    expect(extractPbiNumbers("PBI-0")).toEqual([])
  })

  it("dedupes repeated mentions, keeping first-seen order", () => {
    expect(extractPbiNumbers("See PBI-3 and pbi-3 again, then PBI-1")).toEqual([3, 1])
  })

  it("scans every text argument, in order, and merges results", () => {
    expect(extractPbiNumbers("PBI-1 mentioned here", null, undefined, "and PBI-2 here")).toEqual([1, 2])
  })

  it("returns an empty array when nothing matches or all inputs are nullish", () => {
    expect(extractPbiNumbers()).toEqual([])
    expect(extractPbiNumbers(null, undefined, "")).toEqual([])
    expect(extractPbiNumbers("no ticket reference here")).toEqual([])
  })
})

describe("pbiKey", () => {
  it("formats as PBI-<n>", () => {
    expect(pbiKey(42)).toBe("PBI-42")
    expect(pbiKey(0)).toBe("PBI-0")
  })
})

describe("suggestBranchName", () => {
  it("slugifies an ASCII title", () => {
    expect(suggestBranchName(5, "Fix Login Bug!!")).toBe("feature/PBI-5-fix-login-bug")
  })

  it("falls back to the bare key when the title is null, undefined, or empty", () => {
    expect(suggestBranchName(9, null)).toBe("feature/PBI-9")
    expect(suggestBranchName(9, undefined)).toBe("feature/PBI-9")
    expect(suggestBranchName(9, "   ")).toBe("feature/PBI-9")
  })

  it("falls back to the bare key for a non-ASCII (Japanese) title", () => {
    expect(suggestBranchName(7, "ログイン機能")).toBe("feature/PBI-7")
  })

  it("keeps only the first 6 words", () => {
    expect(suggestBranchName(11, "one two three four five six seven eight")).toBe("feature/PBI-11-one-two-three-four-five-six")
  })

  it("truncates the slug to 40 characters and trims a trailing dash left by truncation", () => {
    const title = "a".repeat(60)
    const result = suggestBranchName(12, title)
    const slug = result.replace("feature/PBI-12-", "")
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith("-")).toBe(false)
  })

  it("collapses diacritics and punctuation via NFKD normalization", () => {
    expect(suggestBranchName(5, "Café résumé")).toBe("feature/PBI-5-cafe-re-sume")
  })
})
