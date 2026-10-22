import { describe, expect, it } from "vitest"
import { findTag, normalizeVersion, pbiReadiness, previousTag, type TagInfo } from "../git-release-rules"

const tag = (name: string, iso: string, title: string | null = null): TagInfo => ({ tag: name, name: title, description: null, url: `https://g/-/tags/${name}`, releasedAt: new Date(iso) })

describe("normalizeVersion", () => {
  it("treats a leading v, case and spaces as the same version", () => {
    expect(normalizeVersion(" V1.4.0 ")).toBe("1.4.0")
    expect(normalizeVersion("v1.4.0")).toBe(normalizeVersion("1.4.0"))
  })

  it("keeps a v that is part of a word", () => {
    expect(normalizeVersion("vision")).toBe("vision")
  })
})

describe("findTag", () => {
  const tags = [tag("v1.4.0", "2026-10-01T00:00:00Z"), tag("v1.3.0", "2026-09-01T00:00:00Z"), tag("rel-7", "2026-08-01T00:00:00Z", "2.0 beta")]

  it("matches the version name against the tag with or without the v", () => {
    expect(findTag("1.4.0", tags)?.tag).toBe("v1.4.0")
    expect(findTag("v1.3.0", tags)?.tag).toBe("v1.3.0")
  })

  it("also matches a GitLab release title", () => {
    expect(findTag("2.0 beta", tags)?.tag).toBe("rel-7")
  })

  it("returns nothing for an unknown or empty version", () => {
    expect(findTag("9.9.9", tags)).toBeUndefined()
    expect(findTag("  ", tags)).toBeUndefined()
  })

  it("takes the newest when several repositories tag the same version", () => {
    const both = [tag("v1.0.0", "2026-01-01T00:00:00Z"), { ...tag("1.0.0", "2026-01-05T00:00:00Z"), url: "second" }]
    expect(findTag("1.0.0", both)?.url).toBe("second")
  })
})

describe("previousTag", () => {
  const a = tag("v1", "2026-08-01T00:00:00Z")
  const b = tag("v2", "2026-09-01T00:00:00Z")
  const c = tag("v3", "2026-10-01T00:00:00Z")

  it("is the tag released just before", () => {
    expect(previousTag(c, [a, b, c])?.tag).toBe("v2")
  })

  it("is undefined for the first tag", () => {
    expect(previousTag(a, [a, b, c])).toBeUndefined()
  })

  it("ignores another repository's tag of the same version", () => {
    expect(previousTag(b, [a, b, { ...b, url: "other" }])?.tag).toBe("v1")
  })
})

describe("pbiReadiness", () => {
  const merged = (iso: string) => ({ state: "merged", mergedAt: new Date(iso) })

  it("is pending without any merge request or while one is open", () => {
    expect(pbiReadiness([], null)).toBe("pending")
    expect(pbiReadiness([merged("2026-09-01T00:00:00Z"), { state: "opened", mergedAt: null }], null)).toBe("pending")
  })

  it("is merged once every request is merged (closed ones are ignored)", () => {
    expect(pbiReadiness([merged("2026-09-01T00:00:00Z"), { state: "closed", mergedAt: null }], null)).toBe("merged")
  })

  it("is pending when a merge landed after the tag", () => {
    const tagAt = new Date("2026-09-15T00:00:00Z")
    expect(pbiReadiness([merged("2026-09-10T00:00:00Z")], tagAt)).toBe("merged")
    expect(pbiReadiness([merged("2026-09-20T00:00:00Z")], tagAt)).toBe("pending")
  })
})
