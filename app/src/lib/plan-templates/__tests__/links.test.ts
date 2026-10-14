import { describe, expect, it } from "vitest"
import { firstLinkProblem, linkBlock, pruneLinks } from "../links"
import { parseTemplateContent, templateContentSchema } from "../schema"

const stages = [
  { key: "a", name: "A", children: [{ key: "a1", name: "A1" }] },
  { key: "b", name: "B" },
  { key: "c", name: "C" },
  { name: "no key" },
]

describe("linkBlock", () => {
  it("allows a plain link", () => {
    expect(linkBlock(stages, [], "a", "b")).toBeNull()
  })

  it("blocks a stage linked to itself, to a missing key, and to its own ancestor / descendant", () => {
    expect(linkBlock(stages, [], "a", "a")).toBe("self")
    expect(linkBlock(stages, [], "a", "zzz")).toBe("unknown")
    expect(linkBlock(stages, [], "a", "a1")).toBe("hierarchy")
    expect(linkBlock(stages, [], "a1", "a")).toBe("hierarchy")
  })

  it("blocks a duplicate and anything that would close a cycle", () => {
    const links = [{ from: "a", to: "b" }, { from: "b", to: "c" }]
    expect(linkBlock(stages, links, "a", "b")).toBe("existing")
    expect(linkBlock(stages, links, "c", "a")).toBe("cycle")
    expect(linkBlock(stages, links, "a", "c")).toBeNull()
  })
})

describe("firstLinkProblem / pruneLinks", () => {
  it("reports the link that closes a cycle and duplicate keys", () => {
    expect(firstLinkProblem(stages, [{ from: "a", to: "b" }, { from: "b", to: "a" }])).toMatch(/b -> a/)
    const twice = [{ key: "x" }, { key: "x" }]
    expect(firstLinkProblem(twice, [])).toMatch(/Duplicate/)
    expect(firstLinkProblem(stages, [{ from: "a", to: "b" }])).toBeNull()
  })

  it("keeps only links whose two ends exist", () => {
    expect(pruneLinks([{ from: "a", to: "b" }, { from: "a", to: "gone" }], new Set(["a", "b"]))).toEqual([{ from: "a", to: "b" }])
  })
})

describe("template content with links", () => {
  it("accepts valid links and keeps them through parse", () => {
    const json = JSON.stringify({ stages: [{ key: "s1", name: "A" }, { key: "s2", name: "B" }], links: [{ from: "s1", to: "s2" }] })
    expect(parseTemplateContent(json).links).toEqual([{ from: "s1", to: "s2" }])
  })

  it("rejects a cyclic or dangling link set (reads as an empty template)", () => {
    const stagesJson = [{ key: "s1", name: "A" }, { key: "s2", name: "B" }]
    expect(templateContentSchema.safeParse({ stages: stagesJson, links: [{ from: "s1", to: "s2" }, { from: "s2", to: "s1" }] }).success).toBe(false)
    expect(templateContentSchema.safeParse({ stages: stagesJson, links: [{ from: "s1", to: "nope" }] }).success).toBe(false)
  })

  it("still accepts content without links (existing templates)", () => {
    expect(templateContentSchema.safeParse({ stages: [{ name: "A" }] }).success).toBe(true)
  })
})
