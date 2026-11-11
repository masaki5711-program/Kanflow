import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({ prisma: {} }))

import { CHANGED_PATHS_STORED, changedPathsQueue, changedPathsValues } from "../git-changed-paths"

describe("N6 changed files of open MRs — pure parts (synthetic)", () => {
  it("reads this sync's MRs first, then the due ones, each once, bounded", () => {
    expect(changedPathsQueue(["3", "1"], ["1", "2", "4"], 3)).toEqual(["3", "1", "2"])
  })

  it("stores at most CHANGED_PATHS_STORED unique paths; more, or a cut listing, is incomplete", () => {
    expect(changedPathsValues({ paths: ["a", "a", "b", " "], complete: true })).toEqual({ changedPaths: ["a", "b"], changedPathsComplete: true })
    expect(changedPathsValues({ paths: ["a"], complete: false }).changedPathsComplete).toBe(false)
    const many = Array.from({ length: CHANGED_PATHS_STORED + 1 }, (_, i) => `f${i}`)
    const v = changedPathsValues({ paths: many, complete: true })
    expect(v.changedPaths).toHaveLength(CHANGED_PATHS_STORED)
    expect(v.changedPathsComplete).toBe(false)
  })
})
