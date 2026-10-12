import { describe, expect, it } from "vitest"
import { computePlanRecalc, type LinkedPbi, type PlanCalcNode } from "../plan-progress"

const TODAY = "2026-10-12"
const day = (key: string) => new Date(`${key}T00:00:00.000Z`)

const leaf = (over: Partial<PlanCalcNode> = {}): PlanCalcNode => ({
  id: "l",
  parentId: null,
  status: "not_started",
  progressPct: 0,
  progressMode: "linked",
  isMilestone: false,
  plannedStart: day("2026-10-01"),
  plannedEnd: day("2026-10-20"),
  actualStart: null,
  actualEnd: null,
  ...over,
})
const pbi = (status: string, inSprint = false): LinkedPbi => ({ status, points: 1, inSprint })
const run = (node: PlanCalcNode, pbis: LinkedPbi[]) => computePlanRecalc([node], new Map([["l", pbis]]), ["l"], TODAY).updates

describe("actual dates derived from linked PBIs", () => {
  it("sets actualStart when the leaf becomes in progress", () => {
    expect(run(leaf(), [pbi("in_progress", true)])).toEqual([{ id: "l", status: "in_progress", actualStart: day(TODAY) }])
  })

  it("sets both actual dates when the leaf becomes done", () => {
    const [u] = run(leaf(), [pbi("completed")])
    expect(u).toMatchObject({ status: "done", progressPct: 100, actualStart: day(TODAY), actualEnd: day(TODAY) })
  })

  it("only fills NULLs: existing actual dates are kept", () => {
    const [u] = run(leaf({ actualStart: day("2026-10-05") }), [pbi("completed")])
    expect(u.actualStart).toBeUndefined()
    expect(u.actualEnd).toEqual(day(TODAY))
    expect(run(leaf({ actualStart: day("2026-10-05"), actualEnd: day("2026-10-06"), status: "done", progressPct: 100 }), [pbi("completed")])).toEqual([])
  })

  it("never fills manual leaves, nodes without loaded actuals, or not-started leaves", () => {
    expect(run(leaf({ progressMode: "manual", status: "done", progressPct: 100 }), [])).toEqual([])
    expect(run(leaf({ actualStart: undefined, actualEnd: undefined }), [pbi("completed")])[0]).not.toHaveProperty("actualStart")
    expect(run(leaf(), [pbi("planned")])).toEqual([])
  })

  it("never writes actual dates to a parent", () => {
    const parent = leaf({ id: "p", progressMode: "manual" })
    const child = leaf({ id: "l", parentId: "p" })
    const { updates } = computePlanRecalc([parent, child], new Map([["l", [pbi("completed")]]]), ["l"], TODAY)
    expect(updates.find((u) => u.id === "p")).not.toHaveProperty("actualEnd")
  })

  it("clears actualEnd (only) when a linked leaf is no longer done", () => {
    const node = leaf({ status: "done", progressPct: 100, actualStart: day("2026-10-05"), actualEnd: day("2026-10-06") })
    const [u] = run(node, [pbi("completed"), pbi("in_progress", true)])
    expect(u).toMatchObject({ status: "in_progress", actualEnd: null })
    expect(u).not.toHaveProperty("actualStart")
  })
})
