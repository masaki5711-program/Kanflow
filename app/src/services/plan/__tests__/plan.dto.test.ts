import { describe, expect, it } from "vitest"
import { summarizeLinked, toLinkedPbi, toPlanItemDto } from "../plan.dto"
import { day, planRow } from "./plan-fixtures"

const ctx = { hasChildren: false, linked: undefined, i18n: undefined, today: "2026-10-05" }

describe("plan.dto", () => {
  it("dates are YYYY-MM-DD (legacy JST-midnight rows included) and computed fields are set", () => {
    const dto = toPlanItemDto(
      planRow({
        plannedStart: new Date("2026-09-30T15:00:00Z"),
        plannedEnd: day("2026-10-04"),
        actualStart: day("2026-10-02"),
        baselineStart: day("2026-09-28"),
        baselineEnd: day("2026-10-01"),
        owner: { id: "u1", name: "Alice" },
        status: "in_progress",
        progressPct: 50,
      }),
      ctx
    )
    expect(dto).toMatchObject({
      plannedStart: "2026-10-01",
      plannedEnd: "2026-10-04",
      actualStart: "2026-10-02",
      actualEnd: null,
      baselineStart: "2026-09-28",
      baselineEnd: "2026-10-01",
      baselineVarianceDays: 3,
      scheduleState: "delayed",
      owner: { id: "u1", name: "Alice" },
      progressMode: "manual",
      i18n: {},
      linked: null,
    })
  })

  it("linked: null for parents, empty summary for a linked leaf without PBIs, the summary otherwise", () => {
    const summary = { pbiCount: 1, pbiDone: 0, pointsTotal: 3, pointsDone: 0, sprints: [] }
    expect(toPlanItemDto(planRow({ progressMode: "linked" }), { ...ctx, hasChildren: true, linked: summary }).linked).toBeNull()
    expect(toPlanItemDto(planRow({ progressMode: "linked" }), ctx).linked).toEqual({ pbiCount: 0, pbiDone: 0, pointsTotal: 0, pointsDone: 0, sprints: [] })
    expect(toPlanItemDto(planRow(), { ...ctx, linked: summary }).linked).toEqual(summary)
    expect(toPlanItemDto(planRow({ progressMode: "weird" }), ctx).progressMode).toBe("manual")
  })

  it("summarizeLinked aggregates counts / points and dedupes sprints sorted by start", () => {
    const s = (id: string, start: string) => ({ sprint: { id, sprintName: id, startDate: day(start), endDate: day(start), status: "active" } })
    const out = summarizeLinked([
      { planItemId: "a", status: "completed", workloadScore: 3, sprintItems: [s("s2", "2026-10-15")] },
      { planItemId: "a", status: "ready", workloadScore: null, sprintItems: [s("s1", "2026-10-01"), s("s2", "2026-10-15")] },
      { planItemId: null, status: "ready", workloadScore: 1, sprintItems: [] },
    ])
    expect(out.get("a")).toEqual({
      pbiCount: 2,
      pbiDone: 1,
      pointsTotal: 3,
      pointsDone: 3,
      sprints: [
        { id: "s1", name: "s1", startDate: "2026-10-01", endDate: "2026-10-01", status: "active" },
        { id: "s2", name: "s2", startDate: "2026-10-15", endDate: "2026-10-15", status: "active" },
      ],
    })
    expect(out.size).toBe(1)
    expect(toLinkedPbi({ planItemId: "a", status: "ready", workloadScore: null, sprintItems: [] })).toEqual({ status: "ready", points: 0, inSprint: false })
  })
})
