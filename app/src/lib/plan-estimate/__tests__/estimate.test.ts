import { describe, expect, it } from "vitest"
import { referenceDateOf } from "../dates"
import { estimateLeaf, learnParallelCap, typePrior } from "../estimate"
import { mulberry32 } from "../synthetic"
import type { EstimateContext, EstimateLeaf, Observation, TypePrior } from "../types"

const R = "2026-11-01"
const NO_PRIOR: TypePrior = { mu0: 0, n: 0, hiddenInfluenced: false, hiddenSourceProjectIds: [] }
const LEAF: EstimateLeaf = { key: "impl", name: "実装", templateDays: 10 }

let seq = 0
function obs(projectId: string, ratio: number, extra: Partial<Observation> = {}): Observation {
  seq++
  return {
    snapshotItemId: `s${seq}`,
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
  }
}

function ctx(visible: string[], extra: Partial<EstimateContext> = {}): EstimateContext {
  return { lineage: "sw", projectType: "software", attributes: [], referenceDate: R, visibleProjectIds: new Set(visible), ...extra }
}

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

describe("estimateLeaf", () => {
  it("no_observations_returns_template", () => {
    const e = estimateLeaf(LEAF, [], ctx([]), NO_PRIOR)
    expect(e.d50).toBe(10)
    expect(e.r50).toBe(1)
    expect(e.d80).toBe(Math.ceil(10 * Math.exp(0.25) - 1e-9))
    expect(e.n).toBe(0)
    expect(e.alpha).toBe(0)
    expect(e.kept).toEqual([])
    expect(e.hiddenInfluenced).toBe(false)
  })

  it("estimate_moves_toward_data_as_n_grows", () => {
    const r50s = [1, 3, 10, 30].map((n) => {
      const projects = ids("v", n)
      return estimateLeaf(LEAF, projects.map((p) => obs(p, 1.5)), ctx(projects), NO_PRIOR).r50
    })
    for (let i = 1; i < r50s.length; i++) expect(r50s[i]).toBeGreaterThan(r50s[i - 1])
    expect(r50s[r50s.length - 1]).toBeLessThanOrEqual(1.5)
    expect(r50s[r50s.length - 1]).toBeGreaterThan(1.4)
  })

  it("outlier_beyond_3_mad_is_dropped_and_reported", () => {
    const projects = ids("v", 6)
    const data = [1.2, 1.25, 1.3, 1.22, 1.28].map((r, i) => obs(projects[i], r))
    const outlier = obs(projects[5], 4.0)
    const e = estimateLeaf(LEAF, [...data, outlier], ctx(projects), NO_PRIOR)
    expect(e.dropped.map((d) => d.snapshotItemId)).toEqual([outlier.snapshotItemId])
    expect(e.kept).toHaveLength(5)
    expect(e.r50).toBeLessThan(1.3)
  })

  it("p80_never_below_p50 (randomized)", () => {
    const rand = mulberry32(7)
    for (let trial = 0; trial < 300; trial++) {
      const n = Math.floor(rand() * 8)
      const projects = ids("v", n)
      const data = projects.map((p) => obs(p, 0.2 + rand() * 5))
      const prior: TypePrior = { mu0: (rand() - 0.5) * 2, n: 5, hiddenInfluenced: false, hiddenSourceProjectIds: [] }
      const e = estimateLeaf({ ...LEAF, templateDays: 1 + Math.floor(rand() * 60) }, data, ctx(projects), prior)
      expect(e.d80).toBeGreaterThanOrEqual(e.d50)
      expect(e.r80).toBeGreaterThanOrEqual(e.r50)
    }
  })

  it("ratio_clamped_to_bounds", () => {
    const many = ids("v", 40)
    const high = estimateLeaf(LEAF, many.map((p) => obs(p, 9)), ctx(many), NO_PRIOR)
    expect(high.r50).toBe(3)
    expect(high.r80).toBe(3)
    expect(high.d50).toBe(30)
    const low = estimateLeaf(LEAF, many.map((p) => obs(p, 0.1)), ctx(many), NO_PRIOR)
    expect(low.r50).toBe(0.5)
    expect(low.d50).toBe(5)
  })

  it("future_projects_never_used", () => {
    const past = obs("v1", 1.5, { closedAt: "2026-09-01", finalizedAt: "2026-09-10" })
    const closedAfterR = obs("v2", 3, { closedAt: "2026-11-02", finalizedAt: "2026-11-03" })
    const finalizedOnR = obs("v3", 3, { closedAt: "2026-10-20", finalizedAt: R })
    const e = estimateLeaf(LEAF, [past, closedAfterR, finalizedOnR], ctx(["v1", "v2", "v3"]), NO_PRIOR)
    expect(e.kept.map((k) => k.sourceProjectId)).toEqual(["v1"])
    expect(e.dropped).toEqual([])
  })

  it("same_input_same_output", () => {
    const projects = ids("v", 5)
    const hidden = ids("h", 6)
    const data = [...projects.map((p, i) => obs(p, 1 + i / 10)), ...hidden.map((p, i) => obs(p, 1.5 + i / 20))]
    const a = estimateLeaf(LEAF, data, ctx(projects), NO_PRIOR)
    const b = estimateLeaf(LEAF, [...data].reverse(), ctx([...projects].reverse()), NO_PRIOR)
    expect(b).toEqual(a)
  })

  it("weights decay with the half-life counted from R", () => {
    const recent = obs("v1", 1.25, { closedAt: "2026-10-01", finalizedAt: "2026-10-02" })
    const old = obs("v2", 1.2, { closedAt: "2025-10-01", finalizedAt: "2025-10-02" })
    const e = estimateLeaf(LEAF, [recent, old], ctx(["v1", "v2"]), NO_PRIOR)
    const w = Object.fromEntries(e.kept.map((k) => [k.sourceProjectId, k.weight]))
    // ages 396 and 31 days from R: exactly one half-life apart
    expect(w.v2 / w.v1).toBeCloseTo(0.5, 9)
  })

  it("matches by former key and drops stages 3-4 once stage 1 has enough", () => {
    const leaf: EstimateLeaf = { key: "impl", name: "実装作業", formerKeys: ["build"], templateDays: 10 }
    const viaFormer = ["v1", "v2", "v3"].map((p) => obs(p, 1.4, { templateKey: "build" }))
    const fuzzy = obs("v4", 1.5, { templateKey: "other", name: "実装作業" })
    const e = estimateLeaf(leaf, [...viaFormer, fuzzy], ctx(["v1", "v2", "v3", "v4"]), NO_PRIOR)
    expect(e.kept.map((k) => k.stage)).toEqual([1, 1, 1])
    const few = estimateLeaf(leaf, [viaFormer[0], fuzzy], ctx(["v1", "v4"]), NO_PRIOR)
    expect(few.kept.map((k) => k.stage).toSorted()).toEqual([1, 4])
  })

  it("stage 2 for another lineage of the same type, nothing for another type", () => {
    const other = obs("v1", 1.4, { lineage: "sw-other" })
    const foreign = obs("v2", 1.4, { projectType: "equipment", lineage: "x" })
    const e = estimateLeaf(LEAF, [other, foreign], ctx(["v1", "v2"]), NO_PRIOR)
    expect(e.kept.map((k) => [k.sourceProjectId, k.stage, k.similarity])).toEqual([["v1", 2, 0.7]])
  })

  it("stage 3 needs a shared attribute; stage 4 a higher similarity", () => {
    const sim = () => 0.65
    const withAttr = obs("v1", 1.4, { templateKey: null, attributes: ["equipment:press-3"] })
    const noAttr = obs("v2", 1.4, { templateKey: null })
    const e = estimateLeaf(LEAF, [withAttr, noAttr], ctx(["v1", "v2"], { attributes: ["equipment:press-3"], similarity: sim }), NO_PRIOR)
    expect(e.kept.map((k) => [k.sourceProjectId, k.stage])).toEqual([["v1", 3]])
    expect(e.kept[0].similarity).toBeCloseTo(0.5 * 0.65)
  })

  it("milestones are fixed to one day", () => {
    const e = estimateLeaf({ key: "gate", name: "検収", templateDays: 5, milestone: true }, [obs("v1", 3, { templateKey: "gate" })], ctx(["v1"]), NO_PRIOR)
    expect([e.d50, e.d80]).toEqual([1, 1])
  })

  it("type prior only: no observation of the item, shrunk type trend", () => {
    const others = ids("v", 10).map((p) => obs(p, 1.5, { templateKey: "test", name: "試験" }))
    const prior = typePrior(others, ctx(ids("v", 10)))
    expect(prior.mu0).toBeCloseTo((10 / 20) * Math.log(1.5), 6)
    const e = estimateLeaf(LEAF, others, ctx(ids("v", 10)), prior)
    expect(e.typePriorOnly).toBe(true)
    expect(e.r50).toBeCloseTo(Math.exp(prior.mu0), 6)
    expect(e.d50).toBe(Math.ceil(10 * Math.exp(prior.mu0) - 1e-9))
  })

  it("lag is suggested only from one day and shrinks toward 0", () => {
    const projects = ids("v", 6)
    const waits = estimateLeaf(LEAF, projects.map((p) => obs(p, 1, { waitGapDays: 4 })), ctx(projects), NO_PRIOR)
    expect(waits.lagDays).toBe(Math.round((6 / 9) * 4))
    const tiny = estimateLeaf(LEAF, ["v1"].map((p) => obs(p, 1, { waitGapDays: 1 })), ctx(["v1"]), NO_PRIOR)
    expect(tiny.lagDays).toBe(0)
  })

  it("load is learned toward the observed share; a zero-load leaf stays zero", () => {
    const projects = ids("v", 6)
    const data = projects.map((p) => obs(p, 1, { loadObserved: 0.5 }))
    const e = estimateLeaf({ ...LEAF, load: 1 }, data, ctx(projects), NO_PRIOR)
    expect(e.load).toBeCloseTo((6 / 9) * 0.5 + (3 / 9) * 1, 2)
    const wait = estimateLeaf({ ...LEAF, load: 0 }, data, ctx(projects), NO_PRIOR)
    expect(wait.load).toBe(0)
  })

  it("mrSet facts come from visible kept sources only", () => {
    const v = ["v1", "v2"].map((p) => obs(p, 1, { mrSetLeadTimeHours: 30, repoTouched: 2 }))
    const h = ids("h", 4).map((p) => obs(p, 1, { mrSetLeadTimeHours: 900, repoTouched: 9 }))
    const e = estimateLeaf(LEAF, [...v, ...h], ctx(["v1", "v2"]), NO_PRIOR)
    expect(e.mrSet).toEqual({ leadTimeP50Hours: 30, repoTouchedP50: 2 })
  })
})

describe("hidden sources (plan 12 §3.2 rules 1-6)", () => {
  it("invisible sources under 3 projects per leaf are not used", () => {
    const visible = obs("v1", 1.2)
    const two = ids("h", 2).map((p) => obs(p, 2.5))
    const base = estimateLeaf(LEAF, [visible], ctx(["v1"]), NO_PRIOR)
    const withTwo = estimateLeaf(LEAF, [visible, ...two], ctx(["v1"]), NO_PRIOR)
    expect(withTwo).toEqual(base)
    // 3 hidden projects round down to h' = 2 < 4: still unused.
    const withThree = estimateLeaf(LEAF, [visible, ...ids("h", 3).map((p) => obs(p, 2.5))], ctx(["v1"]), NO_PRIOR)
    expect(withThree.d50).toBe(base.d50)
    expect(withThree.hiddenInfluenced).toBe(false)
  })

  it("hidden_contribution_is_trimmed_mean_not_single_source_value", () => {
    const ratios = [1.1, 1.3, 1.6, 2.4]
    const hidden = ratios.map((r, i) => obs(`h${i + 1}`, r, { finalizedAt: `2026-06-0${i + 1}` }))
    const e = estimateLeaf(LEAF, hidden, ctx([]), NO_PRIOR)
    const xs = ratios.map((r) => Math.log(r))
    const trimmed = (xs[1] + xs[2]) / 2
    const alpha = 2 / (2 + 3)
    expect(e.alpha).toBeCloseTo(alpha, 9)
    const expected = Math.round(Math.exp(alpha * trimmed) * 10) / 10
    expect(e.r50).toBe(expected)
    expect(e.hiddenInfluenced).toBe(true)
    expect(e.kept).toEqual([])
    expect(e.hiddenSourceProjectIds).toEqual(["h1", "h2", "h3", "h4"])
  })

  it("one_new_hidden_source_does_not_change_estimate", () => {
    const visible = ["v1", "v2"].map((p) => obs(p, 1.2))
    const hidden = (n: number) => ids("h", n).map((p, i) => obs(p, 1.3 + i * 0.37, { finalizedAt: `2026-0${1 + Math.floor(i / 2)}-1${i % 2}` }))
    const four = estimateLeaf(LEAF, [...visible, ...hidden(4)], ctx(["v1", "v2"]), NO_PRIOR)
    const five = estimateLeaf(LEAF, [...visible, ...hidden(5)], ctx(["v1", "v2"]), NO_PRIOR)
    const six = estimateLeaf(LEAF, [...visible, ...hidden(6)], ctx(["v1", "v2"]), NO_PRIOR)
    expect(five).toEqual(four)
    expect(six.hiddenSourceProjectIds).toHaveLength(6)
    expect(six.n).not.toBe(four.n)
  })

  it("a re-finalized hidden source keeps its place (orderAt = first finalization) and one changed value is held", () => {
    const visible = [obs("v1", 1.2)]
    const hidden = ids("h", 4).map((p, i) => obs(p, 1.3 + i * 0.4, { finalizedAt: `2026-05-0${i + 1}` }))
    const sink = new Map()
    const first = estimateLeaf(LEAF, [...visible, ...hidden], ctx(["v1"]), NO_PRIOR, sink)
    const previousHidden = new Map(sink)
    const changedOne = hidden.map((o, i) => (i === 1 ? { ...o, actualDays: o.actualDays * 1.5 } : o))
    const held = estimateLeaf(LEAF, [...visible, ...changedOne], ctx(["v1"], { previousHidden }), NO_PRIOR)
    expect(held.r50).toBe(first.r50)
    const changedTwo = changedOne.map((o, i) => (i === 2 ? { ...o, actualDays: o.actualDays * 1.5 } : o))
    const moved = estimateLeaf(LEAF, [...visible, ...changedTwo], ctx(["v1"], { previousHidden }), NO_PRIOR)
    expect(moved.r50).not.toBe(first.r50)
  })

  it("days_computed_from_rounded_ratio_when_hidden_influenced", () => {
    const hidden = ids("h", 4).map((p, i) => obs(p, [1.13, 1.17, 1.19, 1.23][i]))
    const leaf = { ...LEAF, templateDays: 100 }
    const e = estimateLeaf(leaf, hidden, ctx([]), NO_PRIOR)
    expect(Number.isInteger(e.r50 * 10 + 1e-9) || Math.abs(e.r50 * 10 - Math.round(e.r50 * 10)) < 1e-9).toBe(true)
    expect(e.d50).toBe(Math.ceil(100 * e.r50 - 1e-9))
    expect(e.d80).toBe(Math.ceil(100 * e.r80 - 1e-9))
    expect(Math.abs(e.r80 * 10 - Math.round(e.r80 * 10))).toBeLessThan(1e-9)
  })

  it("ratios stay exact when only visible sources are used", () => {
    const projects = ids("v", 4)
    const e = estimateLeaf({ ...LEAF, templateDays: 100 }, projects.map((p, i) => obs(p, 1.13 + i * 0.01)), ctx(projects), NO_PRIOR)
    expect(e.hiddenInfluenced).toBe(false)
    expect(Math.abs(e.r50 * 10 - Math.round(e.r50 * 10))).toBeGreaterThan(1e-6)
  })

  it("type_prior_applies_hidden_source_rules", () => {
    const visible = ids("v", 2).map((p) => obs(p, 1.2, { templateKey: "x" }))
    const three = ids("h", 3).map((p) => obs(p, 2.8, { templateKey: "y" }))
    const p3 = typePrior([...visible, ...three], ctx(["v1", "v2"]))
    expect(p3.hiddenInfluenced).toBe(false)
    expect(p3.n).toBe(2)
    const four = [...three, obs("h4", 2.2, { templateKey: "y" })]
    const p4 = typePrior([...visible, ...four], ctx(["v1", "v2"]))
    expect(p4.hiddenInfluenced).toBe(true)
    expect(p4.n).toBe(2 + 2)
    const p5 = typePrior([...visible, ...four, obs("h5", 2.9, { templateKey: "y", finalizedAt: "2026-07-01" })], ctx(["v1", "v2"]))
    expect(p5).toEqual(p4)
    // A leaf moved only by a hidden-influenced μ0 is itself hidden-influenced (rounded).
    const e = estimateLeaf({ ...LEAF, key: "fresh", name: "新規" }, [], ctx(["v1", "v2"]), p4)
    expect(e.hiddenInfluenced).toBe(true)
    expect(Math.abs(e.r50 * 10 - Math.round(e.r50 * 10))).toBeLessThan(1e-9)
  })

  it("lag_load_and_parallel_cap_apply_hidden_source_rules", () => {
    const visible = [obs("v1", 1, { waitGapDays: 0, loadObserved: 1 })]
    const hidden3 = ids("h", 3).map((p) => obs(p, 1, { waitGapDays: 20, loadObserved: 0.2 }))
    const e3 = estimateLeaf(LEAF, [...visible, ...hidden3], ctx(["v1"]), NO_PRIOR)
    expect(e3.lagDays).toBe(0)
    expect(e3.load).toBe(1)
    const hidden4 = [...hidden3, obs("h4", 1, { waitGapDays: 20, loadObserved: 0.2 })]
    const e4 = estimateLeaf(LEAF, [...visible, ...hidden4], ctx(["v1"]), NO_PRIOR)
    expect(e4.lagDays).toBeGreaterThan(0)
    expect(e4.load).toBeLessThan(1)
    expect(Math.abs(e4.load * 10 - Math.round(e4.load * 10))).toBeLessThan(1e-9)

    const peak = (projectId: string, value: number, finalizedAt = "2026-05-01") => ({ projectId, finalizedAt, closedAt: "2026-04-25", peak: value })
    const c = ctx(["v1"])
    const own = [peak("v1", 2)]
    expect(learnParallelCap("u1", [...own, peak("h1", 5), peak("h2", 5), peak("h3", 5)], c).hiddenInfluenced).toBe(false)
    const four = learnParallelCap("u1", [...own, peak("h1", 5), peak("h2", 5), peak("h3", 5), peak("h4", 5)], c)
    expect(four.hiddenInfluenced).toBe(true)
    const five = learnParallelCap("u1", [...own, peak("h1", 5), peak("h2", 5), peak("h3", 5), peak("h4", 5), peak("h5", 1, "2026-06-01")], c)
    expect(five).toEqual(four)
  })

  it("parallel cap defaults to 2 without data and stays within 1..5", () => {
    expect(learnParallelCap("u", [], ctx([])).cap).toBe(2)
    const many = ids("v", 30).map((p) => ({ projectId: p, finalizedAt: "2026-05-01", closedAt: "2026-04-25", peak: 12 }))
    expect(learnParallelCap("u", many, ctx(ids("v", 30))).cap).toBe(5)
  })
})

describe("reference date", () => {
  it("reference_date_is_run_month_not_start_date", () => {
    expect(referenceDateOf("2026-11-17")).toBe("2026-11-01")
    expect(referenceDateOf("2026-12-01")).toBe("2026-12-01")
    expect(() => referenceDateOf("2026-02-30")).toThrow()
    // A project that closed on 2026-11-05 is not usable by a run created on 2026-11-17, whatever the start date.
    const late = obs("v1", 2, { closedAt: "2026-11-05", finalizedAt: "2026-11-06" })
    const e = estimateLeaf(LEAF, [late], ctx(["v1"], { referenceDate: referenceDateOf("2026-11-17") }), NO_PRIOR)
    expect(e.kept).toEqual([])
  })
})
