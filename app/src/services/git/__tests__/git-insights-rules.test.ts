import { describe, expect, it } from "vitest"
import { deriveGitHints, type InsightLink } from "../git-insights-rules"

const NOW = new Date("2026-10-21T00:00:00Z")
const mr = (over: Partial<InsightLink> = {}): InsightLink => ({
  kind: "mr", ref: "7", title: "PBI-1 login", url: "https://g/mr/7", state: "opened", pipeline: null, occurredAt: NOW, ...over,
})
const kinds = (h: ReturnType<typeof deriveGitHints>) => h.map((x) => x.kind)

describe("deriveGitHints", () => {
  it("offers to start tasks that are all todo once an MR or branch exists", () => {
    expect(kinds(deriveGitHints(["todo", "todo"], [mr()], NOW))).toEqual(["start"])
    expect(kinds(deriveGitHints(["todo"], [{ ...mr(), kind: "branch", state: null }], NOW))).toEqual(["start"])
  })

  it("does not offer start when work has begun or there is nothing in Git", () => {
    expect(deriveGitHints(["todo", "in_progress"], [mr()], NOW)).toEqual([])
    expect(deriveGitHints(["todo"], [], NOW)).toEqual([])
    expect(deriveGitHints([], [mr()], NOW)).toEqual([])
  })

  it("offers completion when every MR is merged and a task is still open", () => {
    const merged = mr({ state: "merged" })
    expect(kinds(deriveGitHints(["in_progress", "done"], [merged], NOW))).toEqual(["complete"])
    expect(deriveGitHints(["done"], [merged], NOW)).toEqual([])
    expect(kinds(deriveGitHints(["in_progress"], [merged, mr({ ref: "8" })], NOW))).not.toContain("complete")
  })

  it("warns about a failed pipeline and a review nobody touched", () => {
    const stale = mr({ pipeline: "failed", occurredAt: new Date("2026-10-17T00:00:00Z") })
    const h = deriveGitHints(["in_progress"], [stale], NOW)
    expect(kinds(h)).toEqual(["pipeline_failed", "review_stale"])
    expect(h[1].mr?.days).toBe(4)
  })

  it("a fresh open MR with a passing pipeline needs no warning", () => {
    expect(deriveGitHints(["in_progress"], [mr({ pipeline: "success" })], NOW)).toEqual([])
  })
})
