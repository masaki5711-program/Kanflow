import { describe, expect, it } from "vitest"
import { estimateLeaf } from "../estimate"
import { listStageCandidates } from "../plan"
import type { EstimateContext, Observation, TypePrior } from "../types"

/**
 * E6 candidate review in the engine (plan 12 §3.1): only VISIBLE stage-3 / 4 candidates are listed and can be
 * rejected; hidden-source candidates and stage-1 / 2 matches are decided by the formula alone. Synthetic data.
 */
const R = "2026-11-01"
const NO_PRIOR: TypePrior = { mu0: 0, n: 0, hiddenInfluenced: false, hiddenSourceProjectIds: [] }

let seq = 0
function obs(projectId: string, name: string, ratio: number, extra: Partial<Observation> = {}): Observation {
  seq++
  return {
    snapshotItemId: `si${seq}`,
    sourceProjectId: projectId,
    lineage: "other-line",
    projectType: "software",
    templateKey: `k${seq}`,
    name,
    attributes: ["equipment:press"],
    plannedDays: 10,
    actualDays: 10 * ratio,
    closedAt: "2026-06-01",
    finalizedAt: "2026-06-05",
    ...extra,
  }
}

// Names decide the stage through this similarity: "似" → 0.8 (stage 3 with the shared attribute), "遠" → 0.3 (none).
const similarity = (a: string, b: string) => (b.includes("似") ? 0.8 : b.includes("遠") ? 0.3 : a === b ? 1 : 0)
const ctx = (visible: string[], extra: Partial<EstimateContext> = {}): EstimateContext => ({
  lineage: "line",
  projectType: "software",
  attributes: ["equipment:press"],
  referenceDate: R,
  visibleProjectIds: new Set(visible),
  similarity,
  ...extra,
})

describe("stage-3 / 4 candidates (E6)", () => {
  const v1 = obs("pv1", "似た作業A", 1.3)
  const v2 = obs("pv2", "似た作業B", 1.25)
  const far = obs("pv1", "遠い作業", 3)
  const hidden = ["ph1", "ph2", "ph3", "ph4"].map((p) => obs(p, "似た見えない作業", 1.5))
  const all = [v1, v2, far, ...hidden]
  const schedule = { items: [{ key: "build", name: "製作", durationDays: 10 }, { key: "ms", name: "完了", milestone: true }] }

  it("lists visible stage-3 / 4 candidates only (no hidden source, no milestone)", () => {
    const listed = listStageCandidates(schedule, all, ctx(["pv1", "pv2"]))
    expect(listed).toEqual([
      {
        key: "build",
        name: "製作",
        candidates: [
          { snapshotItemId: v1.snapshotItemId, sourceProjectId: "pv1", name: "似た作業A", stage: 3, similarity: 0.4 },
          { snapshotItemId: v2.snapshotItemId, sourceProjectId: "pv2", name: "似た作業B", stage: 3, similarity: 0.4 },
        ],
      },
    ])
    expect(JSON.stringify(listed)).not.toContain("見えない")
  })

  it("a rejected visible candidate leaves the estimate; the formula keeps similarity and weights for the rest", () => {
    const leaf = { key: "build", name: "製作", templateDays: 10 }
    const base = estimateLeaf(leaf, [v1, v2], ctx(["pv1", "pv2"]), NO_PRIOR)
    expect(base.kept.map((k) => k.snapshotItemId).sort()).toEqual([v1.snapshotItemId, v2.snapshotItemId].sort())
    const reviewed = estimateLeaf(leaf, [v1, v2], ctx(["pv1", "pv2"], { rejectedCandidates: new Map([["build", new Set([v1.snapshotItemId])]]) }), NO_PRIOR)
    expect(reviewed.kept.map((k) => k.snapshotItemId)).toEqual([v2.snapshotItemId])
    expect(reviewed.kept[0]).toEqual(base.kept.find((k) => k.snapshotItemId === v2.snapshotItemId))
    expect(reviewed.n).toBeLessThan(base.n)
  })

  it("rejections of hidden or stage-1 matches are ignored (the LLM can only drop what it was shown)", () => {
    const leaf = { key: "build", name: "製作", templateDays: 10 }
    const stage1 = obs("pv1", "製作", 1.4, { templateKey: "build", lineage: "line" })
    const input = [stage1, ...hidden]
    const reject = new Set([stage1.snapshotItemId, ...hidden.map((h) => h.snapshotItemId)])
    const a = estimateLeaf(leaf, input, ctx(["pv1"]), NO_PRIOR)
    const b = estimateLeaf(leaf, input, ctx(["pv1"], { rejectedCandidates: new Map([["build", reject]]) }), NO_PRIOR)
    expect(b).toEqual(a)
    expect(a.hiddenSourceProjectIds).toEqual(["ph1", "ph2", "ph3", "ph4"])
  })
})
