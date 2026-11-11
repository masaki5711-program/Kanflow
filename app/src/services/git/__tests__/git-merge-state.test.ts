import { describe, expect, it, vi } from "vitest"

// The pure parts only: no database (the step itself is tested in git-merge-state.db.test.ts).
vi.mock("@/lib/prisma", () => ({ prisma: {} }))

const { mergeStateQueue, mergeStateValues, predictedPeers, MAX_MERGE_STATE_READS, RESERVED_FOR_DUE } = await import("../git-merge-state")

const refs = (from: number, n: number) => Array.from({ length: n }, (_, i) => String(from + i))

describe("mergeStateQueue", () => {
  it("predicted peers first, then this sync's, then due ones — each once", () => {
    expect(mergeStateQueue(["5"], ["1", "5"], ["9", "1"])).toEqual(["5", "1", "9"])
  })

  it(`keeps ${RESERVED_FOR_DUE} reads for due merge requests even when this sync alone would fill the budget`, () => {
    const q = mergeStateQueue([], refs(1, 30), refs(100, 10))
    expect(q).toHaveLength(MAX_MERGE_STATE_READS)
    expect(q.filter((r) => Number(r) >= 100)).toHaveLength(RESERVED_FOR_DUE)
  })

  it("fills the whole budget from this sync when nothing is due", () => {
    expect(mergeStateQueue([], refs(1, 30), [])).toHaveLength(MAX_MERGE_STATE_READS)
  })
})

describe("stored values", () => {
  it("a prediction not given is 'unavailable', never an empty 'scanned'", () => {
    expect(mergeStateValues({ mergeable: true, blockers: [], conflicts: null }).conflictPrediction).toMatchObject({ status: "unavailable", peers: [] })
  })

  it("predictedPeers reads the peer numbers, anything malformed as none", () => {
    expect(predictedPeers({ peers: [{ iid: 3 }, { iid: "x" }, null] })).toEqual([3])
    expect(predictedPeers(null)).toEqual([])
    expect(predictedPeers({ peers: "x" })).toEqual([])
  })
})
