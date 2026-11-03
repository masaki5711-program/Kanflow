import { describe, expect, it } from "vitest"
import { displayLeaf, displayPlan } from "../display"
import { estimateLeaf, learnParallelCap, resolveConfig } from "../estimate"
import { hiddenAggregate, hiddenUnitKey } from "../hidden"
import { estimatePlan } from "../plan"
import type { EstimateContext, EstimateLeaf, Observation, TypePrior } from "../types"

const R = "2026-11-01"
const NO_PRIOR: TypePrior = { mu0: 0, n: 0, hiddenInfluenced: false, hiddenSourceProjectIds: [] }
const LEAF: EstimateLeaf = { key: "impl", name: "実装", templateDays: 10 }
const ctx = (visible: string[], extra: Partial<EstimateContext> = {}): EstimateContext => ({ lineage: "sw", projectType: "software", attributes: [], referenceDate: R, visibleProjectIds: new Set(visible), ...extra })
const obs = (projectId: string, ratio: number, extra: Partial<Observation> = {}): Observation => ({
  snapshotItemId: `${projectId}:impl`,
  sourceProjectId: projectId,
  lineage: "sw",
  projectType: "software",
  templateKey: "impl",
  name: "実装",
  attributes: [],
  plannedDays: 10,
  actualDays: 10 * ratio,
  closedAt: "2026-06-01",
  finalizedAt: "2026-06-05",
  ...extra,
})
const pt = (projectId: string, x: number, orderAt: string) => ({ projectId, orderAt, x, w: 1 })

describe("held hidden aggregate (review H1/H2)", () => {
  it("a single replaced member (one leaves, the next oldest moves in) is held; a second change recomputes", () => {
    const first = hiddenAggregate([pt("a", 0.1, "2026-01-01"), pt("b", 0.2, "2026-02-01"), pt("c", 0.3, "2026-03-01"), pt("d", 0.4, "2026-04-01"), pt("e", 0.9, "2026-05-01")], { minHiddenSources: 3 })
    expect(first?.projectIds).toEqual(["a", "b", "c", "d"])
    // b leaves learning: e (the next oldest) takes its place — one change, so the published value stays.
    const swapped = hiddenAggregate([pt("a", 0.1, "2026-01-01"), pt("c", 0.3, "2026-03-01"), pt("d", 0.4, "2026-04-01"), pt("e", 0.9, "2026-05-01")], { minHiddenSources: 3 }, first?.state)
    expect(swapped?.held).toBe(true)
    expect(swapped?.x).toBe(first?.x)
    // Plus one changed value: two changes against the published state → recomputed.
    const twice = hiddenAggregate([pt("a", 0.1, "2026-01-01"), pt("c", 0.35, "2026-03-01"), pt("d", 0.4, "2026-04-01"), pt("e", 0.9, "2026-05-01")], { minHiddenSources: 3 }, swapped?.state)
    expect(twice?.held).toBe(false)
  })

  it("the held state is global: another project (another context with the same unit) reads the published value", () => {
    const hidden = [1.0, 1.1, 1.2, 1.3].map((r, i) => obs(`h${i + 1}`, r, { finalizedAt: `2026-05-0${i + 1}` }))
    const store = new Map()
    const plan = estimatePlan({ items: [{ key: "impl", name: "実装", durationDays: 10 }] }, hidden, ctx([]), "2026-11-02")
    for (const [k, v] of plan.hiddenStates) store.set(k, v)
    const changed = hidden.map((o, i) => (i === 1 ? { ...o, actualDays: 25 } : o))
    // A different project (another start date, another run) reading the same global store.
    const other = estimatePlan({ items: [{ key: "impl", name: "実装", durationDays: 10 }] }, changed, ctx([], { previousHidden: store }), "2027-01-04")
    expect(other.leaves[0].r50).toBe(plan.leaves[0].r50)
    // The unit names what is aggregated (the matched hidden items), not the leaf's own key or name.
    expect([...plan.hiddenStates.keys()]).toContain(hiddenUnitKey("ratio", ["sw", "software", [], ["1:impl"], []]))
  })

  it("a renamed leaf (other name, other key, former key pointing at the same items) hits the same held state (E5 security H2)", () => {
    const hidden = [1.0, 1.1, 1.2, 1.3].map((r, i) => obs(`h${i + 1}`, r, { finalizedAt: `2026-05-0${i + 1}` }))
    const store = new Map()
    const plan = estimatePlan({ items: [{ key: "impl", name: "実装", durationDays: 10 }] }, hidden, ctx([]), "2026-11-02")
    for (const [k, v] of plan.hiddenStates) store.set(k, v)
    // One hidden project changes; the requester then renames the leaf to dodge the hold.
    const changed = hidden.map((o, i) => (i === 1 ? { ...o, actualDays: 25 } : o))
    const renamed = estimatePlan({ items: [{ key: "impl2", name: "実装 ", durationDays: 10, formerKeys: ["impl"] }] }, changed, ctx([], { previousHidden: store }), "2026-11-02")
    expect(renamed.leaves[0].r50).toBe(plan.leaves[0].r50)
    expect([...renamed.hiddenStates.keys()].filter((k) => k.startsWith('["ratio"'))).toEqual([...plan.hiddenStates.keys()].filter((k) => k.startsWith('["ratio"')))
  })

  it("viewers with different visible sets never share a held state", () => {
    const all = [1.0, 1.1, 1.2, 1.3, 1.9].map((r, i) => obs(`p${i + 1}`, r, { finalizedAt: `2026-05-0${i + 1}` }))
    const sinkY = new Map()
    estimateLeaf(LEAF, all, ctx(["p1"]), NO_PRIOR, sinkY)
    const sinkX = new Map()
    estimateLeaf(LEAF, all, ctx([], { previousHidden: sinkY }), NO_PRIOR, sinkX)
    const [keyY] = [...sinkY.keys()].filter((k) => k.startsWith('["ratio"'))
    const [keyX] = [...sinkX.keys()].filter((k) => k.startsWith('["ratio"'))
    expect(keyX).not.toBe(keyY)
    expect(sinkX.get(keyX).projectIds).toEqual(["p1", "p2", "p3", "p4"])
  })

  it("the last state survives a unit falling below the floor", () => {
    const hidden = [1.0, 1.1, 1.2, 1.3].map((r, i) => obs(`h${i + 1}`, r, { finalizedAt: `2026-05-0${i + 1}` }))
    const sink = new Map()
    estimateLeaf(LEAF, hidden, ctx([]), NO_PRIOR, sink)
    const key = [...sink.keys()][0]
    const later = new Map()
    estimateLeaf(LEAF, hidden.slice(0, 3), ctx([], { previousHidden: sink }), NO_PRIOR, later)
    expect(later.get(key)).toBe(sink.get(key))
  })
})

describe("robustness (review M1/M3/M4/L1)", () => {
  it("typePriorOnly does not reveal unused hidden observations", () => {
    const prior: TypePrior = { mu0: 0.2, n: 6, hiddenInfluenced: false, hiddenSourceProjectIds: [] }
    const none = estimateLeaf(LEAF, [], ctx([]), prior)
    const twoHidden = estimateLeaf(LEAF, [obs("h1", 2), obs("h2", 2)], ctx([]), prior)
    expect(twoHidden).toEqual(none)
    expect(none.typePriorOnly).toBe(true)
  })

  it("non-finite rows are skipped instead of failing the run", () => {
    const good = ["v1", "v2", "v3"].map((p) => obs(p, 1.2))
    const bad = [obs("v4", Number.POSITIVE_INFINITY), obs("v5", 1, { plannedDays: Number.NaN }), obs("v6", 1, { plannedDays: 1e-320, actualDays: 1e300 })]
    const e = estimateLeaf(LEAF, [...good, ...bad], ctx(["v1", "v2", "v3", "v4", "v5", "v6"]), NO_PRIOR)
    expect(e.kept.map((k) => k.sourceProjectId)).toEqual(["v1", "v2", "v3"])
    expect(Number.isFinite(e.d50)).toBe(true)
    expect(learnParallelCap("u", [{ projectId: "v1", finalizedAt: "2026-05-01", closedAt: "2026-04-01", peak: Number.NaN }], ctx(["v1"])).cap).toBe(2)
  })

  it("config is validated and the hidden-source floor cannot be lowered", () => {
    expect(resolveConfig({ minHiddenSources: 1 }).minHiddenSources).toBe(3)
    expect(resolveConfig({ minHiddenSources: 6 }).minHiddenSources).toBe(6)
    expect(resolveConfig({ shrinkK: undefined }).shrinkK).toBe(3)
    expect(() => resolveConfig({ halfLifeDays: 0 })).toThrow()
    expect(() => resolveConfig({ shrinkK: Number.NaN })).toThrow()
    expect(() => resolveConfig({ ratioMin: 4 })).toThrow()
    expect(() => resolveConfig({ nope: 1 } as never)).toThrow()
    expect(() => resolveConfig({ toString: 1 } as never)).toThrow()
    expect(() => resolveConfig({ ratioMax: 2.95 })).toThrow()
  })

  it("a non-numeric template duration is refused", () => {
    expect(() => estimateLeaf({ ...LEAF, templateDays: Number.NaN }, [], ctx([]), NO_PRIOR)).toThrow(RangeError)
  })
})

describe("display views (review M2)", () => {
  it("bands counts, hides hidden ids and exact alpha, and drops a hidden-shaped mu0", () => {
    const visible = ["v1", "v2"].map((p) => obs(p, 1.234))
    const hidden = ["h1", "h2", "h3", "h4"].map((p, i) => obs(p, 1.5 + i / 10))
    const leaf = estimateLeaf(LEAF, [...visible, ...hidden], ctx(["v1", "v2"]), NO_PRIOR)
    const d = displayLeaf(leaf)
    expect(d.otherProjects).toBe("4-9")
    expect(d.observations).toBe("4-9")
    expect(JSON.stringify(d)).not.toContain("h1")
    expect(d).not.toHaveProperty("alpha")
    expect(d).not.toHaveProperty("n")
    expect(d.sources.map((s) => s.ratio)).toEqual([1.2, 1.2])

    const plan = estimatePlan({ items: [{ key: "impl", name: "実装", durationDays: 10 }] }, hidden.map((o) => ({ ...o, templateKey: "other" })), ctx([]), "2026-11-02")
    expect(plan.typePrior.hiddenInfluenced).toBe(true)
    const shown = displayPlan(plan)
    expect(shown.typePrior.ratio).toBeNull()
    expect(JSON.stringify(shown)).not.toMatch(/"h[1-4]"/)
  })
})
