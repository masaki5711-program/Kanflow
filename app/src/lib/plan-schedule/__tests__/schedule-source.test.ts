import { describe, expect, it } from "vitest"
import { canonicalJson, defaultLineage, lineageSchema, LINEAGE_MAX, SOURCE_REF_MAX, sourceRefSchema } from "../schedule-source"

describe("sourceRefSchema (plan 12 E0)", () => {
  it.each([
    "gitstation:equipment-spec@v1.2.0:schedule.yml",
    "gitstation:plant/line-3.spec@release/2026-11:docs/schedule.yml",
    "template:clx0abc123@v4",
    "template:builtin_equipment@v0",
  ])("accepts %s", (ref) => {
    expect(sourceRefSchema.safeParse(ref).success).toBe(true)
  })

  it.each([
    ["no scheme", "schedule.yml"],
    ["unknown scheme", "http://example.test/schedule.yml"],
    ["gitstation without a tag", "gitstation:repo:schedule.yml"],
    ["gitstation without a path", "gitstation:repo@v1"],
    ["path traversal", "gitstation:repo@v1:../secrets.yml"],
    ["template without a version", "template:abc"],
    ["template with a non-numeric version", "template:abc@vX"],
    ["whitespace", "template:a b@v1"],
    ["too long", `gitstation:${"r".repeat(SOURCE_REF_MAX)}@v1:schedule.yml`],
    ["empty", ""],
  ])("rejects %s", (_label, ref) => {
    expect(sourceRefSchema.safeParse(ref).success).toBe(false)
  })
})

describe("lineageSchema", () => {
  it("trims, accepts user text (any script) and rejects empty, control characters and over-long values", () => {
    expect(lineageSchema.parse("  設備導入の標準工程  ")).toBe("設備導入の標準工程")
    expect(lineageSchema.safeParse("").success).toBe(false)
    expect(lineageSchema.safeParse("a\nb").success).toBe(false)
    expect(lineageSchema.safeParse("x".repeat(LINEAGE_MAX + 1)).success).toBe(false)
  })
})

describe("defaultLineage", () => {
  const hash = "a".repeat(64)
  it("a GitStation source: the repository and path without the tag (stable across versions)", () => {
    expect(defaultLineage({ sourceRef: "gitstation:equipment-spec@v1.2.0:schedule.yml", scheduleHash: hash })).toBe("gitstation:equipment-spec:schedule.yml")
    expect(defaultLineage({ sourceRef: "gitstation:equipment-spec@v2.0.0:schedule.yml", scheduleHash: hash })).toBe("gitstation:equipment-spec:schedule.yml")
  })
  it("a template source: the template id without the version", () => {
    expect(defaultLineage({ sourceRef: "template:clx0abc123@v4", scheduleHash: hash })).toBe("template:clx0abc123")
  })
  it("no source: the caller's schedule name, normalized; otherwise the content hash", () => {
    expect(defaultLineage({ name: "  設備導入  Ａ ", scheduleHash: hash })).toBe("name:設備導入 a")
    expect(defaultLineage({ scheduleHash: hash })).toBe(`schedule:${"a".repeat(16)}`)
    expect(defaultLineage({ name: "   ", scheduleHash: hash })).toBe(`schedule:${"a".repeat(16)}`)
  })
  it("never exceeds the column limit", () => {
    expect(defaultLineage({ name: "n".repeat(500), scheduleHash: hash }).length).toBeLessThanOrEqual(LINEAGE_MAX)
  })
})

describe("canonicalJson", () => {
  it("sorts object keys recursively and keeps array order", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null } })).toBe('{"a":{"c":null,"d":[3,{"x":2,"y":1}]},"b":1}')
    expect(canonicalJson({ a: 1, b: 2 })).toBe(canonicalJson({ b: 2, a: 1 }))
  })
  it("drops undefined members like JSON.stringify", () => {
    expect(canonicalJson({ a: undefined, b: [1] })).toBe('{"b":[1]}')
  })
})
