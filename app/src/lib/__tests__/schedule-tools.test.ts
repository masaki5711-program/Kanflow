import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  planFindMany: vi.fn(),
  depFindMany: vi.fn(),
  sprintFindMany: vi.fn(),
}))

// Every write method throws: schedule tools must never write.
const forbidden = () => {
  throw new Error("schedule tools must not write")
}
vi.mock("@/lib/prisma", () => ({
  prisma: {
    planItem: { findMany: m.planFindMany, create: forbidden, update: forbidden },
    planItemDependency: { findMany: m.depFindMany, create: forbidden },
    sprint: { findMany: m.sprintFindMany, update: forbidden },
  },
}))

const { SCHEDULE_TOOL_DEFS, addDays, buildPlanOps, buildTemplateContent, isYmd, resolvePlanItem, scheduleHandlers } = await import("@/lib/schedule-tools")
const { parseChatProposal } = await import("@/lib/chat-proposals")

const run = async (name: string, args: Record<string, unknown>) => JSON.parse(await scheduleHandlers[name]({ projectId: "p1", args }))
const day = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null)
const row = (id: string, name: string, over: Record<string, unknown> = {}) => ({
  id, parentId: null, name, plannedStart: day("2026-11-01"), plannedEnd: day("2026-11-13"), status: "in_progress", version: 2, ...over,
})
const ROWS = [
  row("a", "Build"),
  row("b", "Test", { plannedStart: day("2026-11-16"), plannedEnd: day("2026-11-20"), status: "not_started" }),
  row("g", "Release", { plannedStart: day("2026-11-01"), plannedEnd: day("2026-11-30") }),
  row("c", "UAT", { parentId: "g", plannedStart: null, plannedEnd: null, status: "not_started" }),
]

beforeEach(() => {
  vi.clearAllMocks()
  m.planFindMany.mockResolvedValue(ROWS)
  m.depFindMany.mockResolvedValue([])
})

describe("definitions", () => {
  it("has exactly one handler per definition", () => {
    expect(Object.keys(scheduleHandlers).sort()).toEqual(SCHEDULE_TOOL_DEFS.map((t) => t.function.name).sort())
  })
})

describe("date arithmetic runs on the server", () => {
  it("accepts only real calendar days", () => {
    expect(isYmd("2026-11-02")).toBe(true)
    expect(isYmd("2026-02-30")).toBe(false)
    expect(isYmd("11/02/2026")).toBe(false)
    expect(isYmd(20261102)).toBe(false)
  })

  it("moves a day across month, year and leap boundaries", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05")
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02")
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29")
    expect(addDays("2026-11-02", -5)).toBe("2026-10-28")
  })
})

describe("resolvePlanItem", () => {
  const rows = ROWS.map((r) => ({ ...r }))

  it("finds a stage by exact name before substring, and by id", () => {
    expect("row" in resolvePlanItem(rows, "Test") && resolvePlanItem(rows, "Test")).toMatchObject({ row: { id: "b" } })
    expect(resolvePlanItem(rows, "uild")).toMatchObject({ row: { id: "a" } })
    expect(resolvePlanItem(rows, "b")).toMatchObject({ row: { id: "b" } })
  })

  it("asks which one when a name is ambiguous, and reports a miss", () => {
    const twin = [...rows, row("d", "Test 2")]
    expect(resolvePlanItem(twin, "Tes")).toMatchObject({ error: expect.stringContaining("several") })
    expect(resolvePlanItem(rows, "zzz")).toMatchObject({ error: expect.stringContaining("no plan stage") })
    expect(resolvePlanItem(rows, " ")).toMatchObject({ error: expect.stringContaining("required") })
  })
})

describe("buildPlanOps", () => {
  it("shifts by whole days, computing both dates and carrying the version", () => {
    const ops = buildPlanOps(ROWS, [{ action: "shift", item: "Test", days: 7, followers: "dependents" }])
    expect(ops).toEqual([{
      op: "shift", target: { id: "b", name: "Test" }, version: 2, days: 7, followers: "dependents",
      before: { plannedStart: "2026-11-16", plannedEnd: "2026-11-20" }, after: { plannedStart: "2026-11-23", plannedEnd: "2026-11-27" },
    }])
  })

  it("updates only what changes and sends the date pair together", () => {
    const ops = buildPlanOps(ROWS, [{ action: "update", item: "Build", end: "2026-11-20", status: "done" }])
    expect(ops).toMatchObject([{
      op: "update",
      changes: { plannedStart: "2026-11-01", plannedEnd: "2026-11-20", status: "done" },
      before: { plannedStart: "2026-11-01", plannedEnd: "2026-11-13", status: "in_progress" },
    }])
  })

  it("creates a stage under a named parent, dated or undated", () => {
    const ops = buildPlanOps(ROWS, [
      { action: "create", name: "Retro", parent: "Release", start: "2026-11-27", end: "2026-11-30", milestone: true },
      { action: "create", name: "Later" },
    ])
    expect(ops).toMatchObject([
      { op: "create", name: "Retro", parent: { id: "g" }, plannedStart: "2026-11-27", plannedEnd: "2026-11-30", isMilestone: true },
      { op: "create", name: "Later", parent: null, plannedStart: null, plannedEnd: null, isMilestone: false },
    ])
  })

  it("refuses bad input with a reason the model can act on", () => {
    const err = (op: unknown) => (buildPlanOps(ROWS, [op]) as { error: string }).error
    expect(err({ action: "shift", item: "Test", days: 0 })).toMatch(/non-zero/)
    expect(err({ action: "shift", item: "UAT", days: 3 })).toMatch(/no dates/)
    expect(err({ action: "shift", item: "Release", days: 3 })).toMatch(/group/)
    expect(err({ action: "update", item: "Release", end: "2026-12-31" })).toMatch(/group/)
    expect(err({ action: "update", item: "Build", end: "2026-02-30" })).toMatch(/real date/)
    expect(err({ action: "update", item: "Build", start: "2026-11-20" })).toMatch(/after end/)
    expect(err({ action: "update", item: "UAT", start: "2026-11-02" })).toMatch(/both start and end/)
    expect(err({ action: "update", item: "Build", status: "delayed" })).toMatch(/status must be/)
    expect(err({ action: "update", item: "Build", end: "2026-11-13" })).toMatch(/nothing changes/)
    expect(err({ action: "create", name: "X", start: "2026-11-01" })).toMatch(/both start and end/)
    expect(err({ action: "merge" })).toMatch(/action must be/)
    expect((buildPlanOps(ROWS, []) as { error: string }).error).toMatch(/non-empty/)
  })

  it("rejects editing the same stage twice in one card (its version would be stale)", () => {
    const out = buildPlanOps(ROWS, [
      { action: "shift", item: "Test", days: 1 },
      { action: "update", item: "Test", status: "done" },
    ])
    expect((out as { error: string }).error).toMatch(/edited twice/)
  })

  it("caps the number of operations", () => {
    const many = Array.from({ length: 21 }, () => ({ action: "create", name: "X" }))
    expect((buildPlanOps(ROWS, many) as { error: string }).error).toMatch(/at most 20/)
  })
})

describe("propose_plan_edit", () => {
  it("returns a valid plan_edit proposal with a stable id and the not-written note", async () => {
    const args = { operations: [{ action: "shift", item: "Test", days: 7 }], reason: "slip" }
    const out = await run("propose_plan_edit", args)
    expect(parseChatProposal(out.proposal)).not.toBeNull()
    expect(out.proposal.kind).toBe("plan_edit")
    expect(out.note).toMatch(/NOTHING has been written/)
    expect((await run("propose_plan_edit", args)).proposal.proposalId).toBe(out.proposal.proposalId)
  })

  it("returns the validation error instead of a card", async () => {
    expect(await run("propose_plan_edit", { operations: [{ action: "shift", item: "zzz", days: 1 }] })).toEqual({
      error: expect.stringContaining("no plan stage"),
    })
  })
})

describe("propose_sprint_schedule", () => {
  const sprint = { id: "s1", sprintName: "Sprint 12", startDate: day("2026-10-12"), endDate: day("2026-10-23"), version: 4 }

  it("moves the whole sprint by shift_days", async () => {
    m.sprintFindMany.mockResolvedValue([sprint])
    const out = await run("propose_sprint_schedule", { shift_days: 7 })
    expect(parseChatProposal(out.proposal)).not.toBeNull()
    expect(out.proposal).toMatchObject({
      kind: "sprint_schedule", version: 4,
      before: { startDate: "2026-10-12", endDate: "2026-10-23" }, after: { startDate: "2026-10-19", endDate: "2026-10-30" },
    })
  })

  it("takes an explicit end and keeps the start", async () => {
    m.sprintFindMany.mockResolvedValue([sprint])
    const out = await run("propose_sprint_schedule", { end: "2026-10-30" })
    expect(out.proposal.after).toEqual({ startDate: "2026-10-12", endDate: "2026-10-30" })
  })

  it("refuses an empty change, an inverted period, an ambiguous name and no open sprint", async () => {
    m.sprintFindMany.mockResolvedValue([sprint])
    expect(await run("propose_sprint_schedule", {})).toEqual({ error: "the period does not change" })
    expect(await run("propose_sprint_schedule", { end: "2026-10-01" })).toEqual({ error: "start must not be after end" })
    expect(await run("propose_sprint_schedule", { shift_days: 1.5 })).toEqual({ error: expect.stringContaining("whole number") })
    m.sprintFindMany.mockResolvedValue([sprint, { ...sprint, id: "s2", sprintName: "Sprint 13" }])
    expect(await run("propose_sprint_schedule", { sprint: "Sprint", shift_days: 1 })).toEqual({ error: expect.stringContaining("ambiguous") })
    m.sprintFindMany.mockResolvedValue([])
    expect(await run("propose_sprint_schedule", { shift_days: 1 })).toEqual({ error: expect.stringContaining("no matching open sprint") })
  })
})

describe("propose_template", () => {
  const stages = [
    { name: "Design", duration_days: 10, checklist: ["Reviewed"], children: [{ name: "Spec", duration_days: 3 }] },
    { name: "Release", milestone: true },
  ]

  it("maps the model's snake_case stages onto the template content", () => {
    expect(buildTemplateContent({ stages })).toEqual({
      stages: [
        { name: "Design", durationDays: 10, checklist: ["Reviewed"], children: [{ name: "Spec", durationDays: 3 }] },
        { name: "Release", isMilestone: true },
      ],
    })
  })

  it("keeps check items and documents, and drops blank ones", () => {
    const content = buildTemplateContent({ stages, check_label: "検収", checks: [{ name: "Functional", criterion: "All pass" }], documents: ["Manual", " "] })
    expect(content).toMatchObject({ checkLabel: "検収", checks: [{ name: "Functional", criterion: "All pass" }], documents: ["Manual"] })
  })

  it("reports where the content is invalid", () => {
    expect((buildTemplateContent({ stages: [] }) as { error: string }).error).toMatch(/at least one stage/)
    expect((buildTemplateContent({ stages: [{ name: "" }] }) as { error: string }).error).toMatch(/invalid at stages/)
    const deep = { name: "1", children: [{ name: "2", children: [{ name: "3", children: [{ name: "4" }] }] }] }
    expect((buildTemplateContent({ stages: [deep] }) as { error: string }).error).toMatch(/nest at most 3/)
  })

  it("returns a card that is private unless asked, with the stage count", async () => {
    const out = await run("propose_template", { name: "Release plan", stages })
    expect(parseChatProposal(out.proposal)).not.toBeNull()
    expect(out.proposal).toMatchObject({ kind: "create_template", name: "Release plan", visibility: "private", stageCount: 3 })
    expect((await run("propose_template", { name: "Release plan", visibility: "public", stages })).proposal.visibility).toBe("public")
    expect(await run("propose_template", { stages })).toEqual({ error: "name is required" })
  })
})

describe("list_plan_schedule", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] })
    vi.setSystemTime(new Date("2026-11-15T00:00:00Z"))
  })
  afterEach(() => vi.useRealTimers())

  it("lists stages by name with parent, dates, group / late flags and what they wait for", async () => {
    m.depFindMany.mockResolvedValue([{ predecessorId: "a", successorId: "b" }])
    const out = await run("list_plan_schedule", {})
    const byName = Object.fromEntries(out.items.map((i: { name: string }) => [i.name, i]))
    expect(byName.Test).toMatchObject({ start: "2026-11-16", end: "2026-11-20", waitsFor: ["Build"] })
    expect(byName.UAT).toMatchObject({ parent: "Release", start: null, end: null })
    expect(byName.Release.group).toBe(true)
    expect(byName.Build.late).toBe(true) // planned end 11-13 has passed on 11-15 and it is not done
    expect(byName.Test.late).toBeUndefined()
    expect(out.as_of).toBe("2026-11-15")
  })

  it("narrows to the stages under a name and reports a miss", async () => {
    const out = await run("list_plan_schedule", { under: "Release" })
    expect(out.items.map((i: { name: string }) => i.name)).toEqual(["Release", "UAT"])
    expect(await run("list_plan_schedule", { under: "zzz" })).toEqual({ error: expect.stringContaining("no plan stage") })
  })
})

describe("a shift that moves the following stages", () => {
  it("stands alone among edits, but may be accompanied by new stages", () => {
    const shift = { action: "shift", item: "Test", days: 3, followers: "later" }
    const err = buildPlanOps(ROWS, [shift, { action: "update", item: "Build", status: "done" }]) as { error: string }
    expect(err.error).toMatch(/on its own/)
    expect(Array.isArray(buildPlanOps(ROWS, [shift, { action: "create", name: "Retro" }]))).toBe(true)
    expect(Array.isArray(buildPlanOps(ROWS, [{ ...shift, followers: "none" }, { action: "update", item: "Build", status: "done" }]))).toBe(true)
  })
})
