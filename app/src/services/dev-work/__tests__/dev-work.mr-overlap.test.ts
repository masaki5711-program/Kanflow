import { describe, expect, it } from "vitest"
import { isEmptyWarnings, mrWarnings, type MrLinkForOverlap } from "../dev-work.mr-overlap"

// Synthetic merge requests only.
const link = (over: Partial<MrLinkForOverlap>): MrLinkForOverlap => ({
  repositoryId: "repo-1",
  repository: "api",
  ref: "10",
  title: "synthetic MR",
  url: "https://git.example.test/g/api/-/merge_requests/10",
  author: "Dev Two",
  sourceBranch: "feature/PBI-7",
  backlogItemId: "pbi-7",
  pbiDisplayId: 7,
  confidential: false,
  changedPaths: null,
  changedPathsComplete: null,
  conflictPrediction: null,
  mergeStatusAt: null,
  ...over,
})

const claim = { backlogItemId: "pbi-12", branch: "feature/PBI-12", scope: [{ kind: "path" as const, value: "app/src/services/dev-work" }, { kind: "module" as const, value: "forge-auth" }] }

describe("N6 MR overlap warnings (synthetic)", () => {
  it("names another open MR that already changes files of the scope, with its PBIs and the covered files", () => {
    const w = mrWarnings(claim, [
      link({ changedPaths: ["app/src/services/dev-work/dev-work.service.ts", "README.md", "crates/forge-auth/src/lib.rs"], changedPathsComplete: true }),
      // The same MR linked to a second PBI: one MR, both PBIs.
      link({ backlogItemId: "pbi-8", pbiDisplayId: 8, changedPaths: ["app/src/services/dev-work/dev-work.service.ts"] }),
    ], false)
    expect(w.mergeRequestOverlaps).toEqual([
      expect.objectContaining({ source: "mr_paths", ref: "10", pbis: [7, 8], count: 2, paths: ["app/src/services/dev-work/dev-work.service.ts", "crates/forge-auth/src/lib.rs"], complete: true }),
    ])
  })

  it("leaves out the claim's own PBI, its own branch, MRs without a file list, and files outside the scope", () => {
    const w = mrWarnings(claim, [
      link({ ref: "1", backlogItemId: "pbi-12", pbiDisplayId: 12, changedPaths: ["app/src/services/dev-work/x.ts"] }),
      link({ ref: "2", sourceBranch: "feature/PBI-12", changedPaths: ["app/src/services/dev-work/x.ts"] }),
      link({ ref: "3", changedPaths: null }),
      link({ ref: "4", changedPaths: ["app/src/services/dev-workx/y.ts", "../app/src/services/dev-work/z.ts", "/abs/app/src/services/dev-work/z.ts"] }),
    ], false)
    expect(w.mergeRequestOverlaps).toEqual([])
    expect(isEmptyWarnings(w)).toBe(true)
  })

  it("says when an MR's file list was cut short", () => {
    const w = mrWarnings(claim, [link({ changedPaths: ["app/src/services/dev-work/a.ts"], changedPathsComplete: false })], false)
    expect(w.mergeRequestOverlaps[0]?.complete).toBe(false)
  })

  it("reports the PBI's predicted conflicts with the other MR, and a scan that is not complete as unchecked", () => {
    const w = mrWarnings(claim, [
      link({ ref: "20", backlogItemId: "pbi-12", pbiDisplayId: 12, mergeStatusAt: new Date("2026-11-11T01:00:00Z"), conflictPrediction: { status: "scanned", stale: false, peers: [{ iid: 10, outcome: "conflict", files: 3 }, { iid: 11, outcome: "failed", files: 0 }] } }),
      link({ ref: "21", backlogItemId: "pbi-12", pbiDisplayId: 12, conflictPrediction: { status: "partial", stale: false, peers: [] } }),
      link({ ref: "10", title: "other synthetic MR" }),
    ], false)
    expect(w.predictedConflicts).toEqual([
      expect.objectContaining({ source: "predicted", ref: "20", files: 3, peer: { ref: "10", title: "other synthetic MR", url: expect.any(String), pbis: [7] }, checkedAt: "2026-11-11T01:00:00.000Z" }),
    ])
    expect(w.predictionUnchecked).toEqual(["21"])
  })

  it("token surfaces: MRs of confidential PBIs are not named (an overlap is dropped, a conflict peer becomes anonymous)", () => {
    const links = [
      link({ ref: "10", confidential: true, changedPaths: ["app/src/services/dev-work/a.ts"] }),
      link({ ref: "20", backlogItemId: "pbi-12", pbiDisplayId: 12, conflictPrediction: { status: "scanned", stale: false, peers: [{ iid: 10, outcome: "conflict", files: 1 }] } }),
    ]
    const hidden = mrWarnings(claim, links, true)
    expect(hidden.mergeRequestOverlaps).toEqual([])
    expect(hidden.predictedConflicts[0]?.peer).toBeNull()
    // Screens (project members) show them.
    const shown = mrWarnings(claim, links, false)
    expect(shown.mergeRequestOverlaps).toHaveLength(1)
    expect(shown.predictedConflicts[0]?.peer?.ref).toBe("10")
  })

  it("token surfaces: a conflict peer Kanflow has not read (maybe a confidential PBI's) is never named", () => {
    const own = link({ ref: "20", backlogItemId: "pbi-12", pbiDisplayId: 12, conflictPrediction: { status: "scanned", stale: false, peers: [{ iid: 99, outcome: "conflict", files: 1 }] } })
    expect(mrWarnings(claim, [own], true).predictedConflicts[0]?.peer).toBeNull()
    expect(mrWarnings(claim, [own], false).predictedConflicts[0]?.peer).toEqual({ ref: "99", title: null, url: null, pbis: [] })
  })

  it("no scope: no path overlap is computed (predictions still are)", () => {
    const w = mrWarnings({ ...claim, scope: [] }, [link({ changedPaths: ["app/src/services/dev-work/a.ts"] })], false)
    expect(w.mergeRequestOverlaps).toEqual([])
  })
})
