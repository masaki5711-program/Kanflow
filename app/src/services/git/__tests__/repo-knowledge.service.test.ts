import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("../repo-index-runner", () => ({ isIndexing: (id: string) => id === "busy" }))

const { aiPathFilterField, knowledgePatch, toKnowledgeDto } = await import("../repo-knowledge.service")

const OFF = { aiKnowledge: false, aiPathFilter: null }
const ON = { aiKnowledge: true, aiPathFilter: null }

describe("knowledgePatch", () => {
  it("switching on clears the index and starts a pass", () => {
    const p = knowledgePatch(OFF, { aiKnowledge: true })
    expect(p.data).toMatchObject({ aiKnowledge: true, indexedSha: null, indexTargetSha: null, indexCursor: null, indexedAt: null, indexedFiles: 0 })
    expect(p).toMatchObject({ purge: false, reindex: true, changes: { "git.aiKnowledge": { from: false, to: true } } })
  })

  it("switching off purges the stored passages and never re-indexes", () => {
    const p = knowledgePatch(ON, { aiKnowledge: false })
    expect(p).toMatchObject({ purge: true, reindex: false })
    expect(p.data).toMatchObject({ aiKnowledge: false, indexedFiles: 0, indexedAt: null })
  })

  it("a new folder filter while on restarts a full pass but keeps the last import time", () => {
    const p = knowledgePatch(ON, { aiPathFilter: "docs" })
    expect(p.data).toEqual({ aiPathFilter: "docs/", indexedSha: null, indexTargetSha: null, indexCursor: null, indexError: null, indexErrorAt: null })
    expect(p).toMatchObject({ purge: false, reindex: true, changes: { "git.aiPathFilter": { from: null, to: "docs/" } } })
  })

  it("a filter saved while off is only stored", () => {
    expect(knowledgePatch(OFF, { aiPathFilter: "docs/" })).toMatchObject({ data: { aiPathFilter: "docs/" }, purge: false, reindex: false })
  })

  it("an unchanged value is a no-op (same normalised filter, same switch)", () => {
    expect(knowledgePatch({ aiKnowledge: true, aiPathFilter: "docs/" }, { aiKnowledge: true, aiPathFilter: " docs " })).toEqual({ data: {}, purge: false, reindex: false, changes: {} })
    expect(knowledgePatch(ON, {})).toEqual({ data: {}, purge: false, reindex: false, changes: {} })
  })

  it("clearing the filter means the whole repository", () => {
    expect(knowledgePatch({ aiKnowledge: true, aiPathFilter: "docs/" }, { aiPathFilter: "" }).data).toMatchObject({ aiPathFilter: null })
  })
})

describe("aiPathFilterField", () => {
  it("accepts folder lists and null, refuses traversal", () => {
    expect(aiPathFilterField.safeParse("docs/, specs").success).toBe(true)
    expect(aiPathFilterField.safeParse(null).success).toBe(true)
    expect(aiPathFilterField.safeParse("../secret").success).toBe(false)
    expect(aiPathFilterField.safeParse("x".repeat(1001)).success).toBe(false)
  })
})

describe("toKnowledgeDto", () => {
  const row = { id: "r1", aiKnowledge: true, aiPathFilter: null, indexedSha: "abc", indexedAt: new Date("2026-10-01T00:00:00Z"), indexedFiles: 137, indexError: null, indexErrorAt: null, indexTargetSha: null }

  it("reports the index state", () => {
    expect(toKnowledgeDto(row)).toEqual({
      aiKnowledge: true,
      aiPathFilter: null,
      indexedAt: "2026-10-01T00:00:00.000Z",
      indexedFiles: 137,
      indexError: null,
      indexErrorAt: null,
      indexing: false,
      indexPending: false,
    })
  })

  it("is pending while a pass is unfinished or nothing was indexed yet, and indexing while running", () => {
    expect(toKnowledgeDto({ ...row, indexTargetSha: "abc" }).indexPending).toBe(true)
    expect(toKnowledgeDto({ ...row, indexedAt: null }).indexPending).toBe(true)
    expect(toKnowledgeDto({ ...row, indexedSha: null }).indexPending).toBe(true)
    expect(toKnowledgeDto({ ...row, aiKnowledge: false, indexedAt: null }).indexPending).toBe(false)
    expect(toKnowledgeDto({ ...row, id: "busy" }).indexing).toBe(true)
  })
})
