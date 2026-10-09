import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  pbiFindFirst: vi.fn(),
  pbiFindMany: vi.fn(),
  sbiFindMany: vi.fn(),
  iceFindMany: vi.fn(),
  sprintFindMany: vi.fn(),
}))

// Every write method throws: proposal tools must never write.
const forbidden = () => {
  throw new Error("proposal tools must not write")
}
vi.mock("@/lib/prisma", () => ({
  prisma: {
    productBacklogItem: { findFirst: m.pbiFindFirst, findMany: m.pbiFindMany, create: forbidden, update: forbidden },
    sprintBacklogItem: { findMany: m.sbiFindMany, create: forbidden, update: forbidden },
    iceboxItem: { findMany: m.iceFindMany, create: forbidden, update: forbidden },
    sprint: { findMany: m.sprintFindMany, update: forbidden },
  },
}))

const { PROPOSAL_TOOL_DEFS, proposalHandlers, parseTaskList, proposalIdOf } = await import("@/lib/proposal-tools")
const { parseChatProposal } = await import("@/lib/chat-proposals")

const run = async (name: string, args: Record<string, unknown>) => JSON.parse(await proposalHandlers[name]({ projectId: "p1", args }))

beforeEach(() => {
  vi.clearAllMocks()
  m.pbiFindMany.mockResolvedValue([])
  m.iceFindMany.mockResolvedValue([])
})

describe("definitions", () => {
  it("has exactly one handler per definition", () => {
    expect(Object.keys(proposalHandlers).sort()).toEqual(PROPOSAL_TOOL_DEFS.map((t) => t.function.name).sort())
  })
})

describe("propose_pbi", () => {
  it("returns a valid create_pbi proposal with a stable id and a not-written note", async () => {
    const args = { title: "SSO login", user_story: "As a user…", acceptance_criteria: "- ok", story_points: 5, reason: "asked" }
    const out = await run("propose_pbi", args)
    expect(parseChatProposal(out.proposal)).not.toBeNull()
    expect(out.proposal).toMatchObject({ kind: "create_pbi", title: "SSO login", storyPoints: 5, epic: null })
    expect(out.proposal.proposalId).toMatch(/^prop_[0-9a-f]{16}$/)
    expect(out.note).toMatch(/NOTHING has been written/)
    const again = await run("propose_pbi", args)
    expect(again.proposal.proposalId).toBe(out.proposal.proposalId)
    expect((await run("propose_pbi", { ...args, title: "Other" })).proposal.proposalId).not.toBe(out.proposal.proposalId)
  })

  it("flags possible duplicates among the project's live PBIs", async () => {
    m.pbiFindMany.mockResolvedValue([
      { displayId: 3, initiative: "SSO login support", userStory: null },
      { displayId: 4, initiative: "Gantt colors", userStory: null },
    ])
    const out = await run("propose_pbi", { title: "SSO login" })
    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1", deletedAt: null })
    expect(out.proposal.possibleDuplicates.map((d: { displayId: number }) => d.displayId)).toEqual([3])
  })

  it("rejects a missing title and off-scale points", async () => {
    expect(await run("propose_pbi", { title: "  " })).toEqual({ error: "title is required" })
    expect((await run("propose_pbi", { title: "x", story_points: 4 })).error).toMatch(/one of 0, 1, 2, 3, 5, 8, 13, 21/)
  })
})

describe("propose_task_split", () => {
  const PBI = { id: "pb-1", displayId: 12, initiative: "Login", userStory: null, status: "ready", version: 2 }
  const sprint = (id: string, start: string) => ({ id, sprintName: id.toUpperCase(), startDate: new Date(start) })

  it("targets the newest open sprint of the PBI and skips existing task names", async () => {
    m.pbiFindFirst.mockResolvedValue(PBI)
    m.sbiFindMany.mockResolvedValue([
      { taskName: "Design", sprint: sprint("s2", "2026-03-01") },
      { taskName: "Old", sprint: sprint("s1", "2026-02-01") },
    ])
    const out = await run("propose_task_split", {
      pbi_id: "#12",
      tasks: [{ name: "design" }, { name: "Implement", estimate: 3 }, "Test"],
    })
    expect(m.pbiFindFirst.mock.calls[0][0].where).toEqual({ projectId: "p1", displayId: 12, deletedAt: null })
    expect(m.sbiFindMany.mock.calls[0][0].where).toEqual({
      pbItemId: "pb-1",
      sprint: { projectId: "p1", status: { in: ["planning", "active", "review"] } },
    })
    expect(out.proposal).toMatchObject({
      kind: "task_split",
      pbi: { id: "pb-1", displayId: 12, title: "Login" },
      sprint: { id: "s2", name: "S2" },
      tasks: [{ name: "Implement", estimate: 3 }, { name: "Test", estimate: null }],
      skippedExisting: ["design"],
    })
    expect(parseChatProposal(out.proposal)).not.toBeNull()
  })

  it("refuses when the PBI is not in an open sprint or not in the project", async () => {
    m.pbiFindFirst.mockResolvedValueOnce(PBI)
    m.sbiFindMany.mockResolvedValueOnce([])
    expect((await run("propose_task_split", { pbi_id: "#12", tasks: ["a"] })).error).toMatch(/not in an open sprint/)
    m.pbiFindFirst.mockResolvedValueOnce(null)
    expect((await run("propose_task_split", { pbi_id: "#99", tasks: ["a"] })).error).toMatch(/not found/)
  })

  it("validates the task list", () => {
    expect(parseTaskList([])).toEqual({ error: "tasks must be a non-empty array" })
    expect(parseTaskList(Array.from({ length: 13 }, (_, i) => `t${i}`))).toEqual({ error: "at most 12 tasks" })
    expect(parseTaskList([{ name: "" }])).toEqual({ error: "every task needs a name" })
    expect(parseTaskList([{ name: "a", estimate: -1 }])).toEqual({ error: 'invalid estimate for "a"' })
    expect(parseTaskList([{ name: "a", estimate: "2" }])).toEqual([{ name: "a", estimate: 2 }])
  })
})

describe("propose_status_change", () => {
  it("proposes a PBI status change with the loaded version", async () => {
    m.pbiFindFirst.mockResolvedValue({ id: "pb-1", displayId: 3, initiative: "Login", userStory: null, status: "not_ready", version: 7 })
    const out = await run("propose_status_change", { entity: "pbi", id: "3", new_status: "ready", reason: "AC written" })
    expect(out.proposal).toMatchObject({
      kind: "status_change", entity: "pbi", fromStatus: "not_ready", toStatus: "ready", version: 7,
      target: { id: "pb-1", displayId: 3, sprintId: null },
    })
  })

  it("proposes a task status change found by name in open sprints of the project", async () => {
    m.sbiFindMany.mockResolvedValue([{ id: "t1", taskName: "Write tests", status: "in_progress", version: 1, sprintId: "s1" }])
    const out = await run("propose_status_change", { entity: "task", task_name: "tests", new_status: "done" })
    expect(m.sbiFindMany.mock.calls[0][0].where).toMatchObject({
      sprint: { projectId: "p1", status: { in: ["planning", "active", "review"] } },
      pbItem: { deletedAt: null },
      taskName: { contains: "tests" },
    })
    expect(out.proposal).toMatchObject({ entity: "task", target: { id: "t1", sprintId: "s1" }, fromStatus: "in_progress", toStatus: "done", version: 1 })
  })

  it("rejects invalid statuses, no-op changes, ambiguity and unknown entities", async () => {
    expect((await run("propose_status_change", { entity: "pbi", id: "#1", new_status: "done" })).error).toMatch(/ready, not_ready, completed/)
    m.pbiFindFirst.mockResolvedValueOnce({ id: "pb", displayId: 1, initiative: "x", userStory: null, status: "ready", version: 0 })
    expect((await run("propose_status_change", { entity: "pbi", id: "#1", new_status: "ready" })).error).toMatch(/already ready/)
    m.sbiFindMany.mockResolvedValueOnce([
      { id: "t1", taskName: "A", status: "todo", version: 0, sprintId: "s" },
      { id: "t2", taskName: "A2", status: "todo", version: 0, sprintId: "s" },
    ])
    expect((await run("propose_status_change", { entity: "task", task_name: "A", new_status: "done" })).error).toMatch(/ambiguous/)
    expect(await run("propose_status_change", { entity: "sprint", new_status: "done" })).toEqual({ error: "entity must be pbi | task" })
  })
})

describe("proposalIdOf", () => {
  it("is deterministic per kind and payload", () => {
    expect(proposalIdOf("a", { x: 1 })).toBe(proposalIdOf("a", { x: 1 }))
    expect(proposalIdOf("a", { x: 1 })).not.toBe(proposalIdOf("b", { x: 1 }))
  })
})


describe("propose_icebox", () => {
  it("returns a valid create_icebox proposal and warns about similar items", async () => {
    m.iceFindMany.mockResolvedValue([{ displayId: 9, request: "Dark mode for the board" }])
    const out = await run("propose_icebox", { request: "Dark mode for the board", background: "night shifts" })
    expect(parseChatProposal(out.proposal)).not.toBeNull()
    expect(out.proposal).toMatchObject({ kind: "create_icebox", request: "Dark mode for the board", background: "night shifts" })
    expect(out.note).toMatch(/NOTHING has been written/)
    expect(out.note).toMatch(/#9/)
  })

  it("stays quiet when nothing is similar and rejects an empty request", async () => {
    const out = await run("propose_icebox", { request: "Export to PDF" })
    expect(out.note).not.toMatch(/Similar/)
    expect(await run("propose_icebox", { request: " " })).toEqual({ error: "request is required" })
  })
})

describe("propose_sprint_pbi", () => {
  const pbi = { id: "pb1", displayId: 12, initiative: "Login", userStory: null, status: "ready", version: 3 }
  const sprint = { id: "s1", sprintName: "Sprint 12" }

  beforeEach(() => {
    m.pbiFindFirst.mockResolvedValue(pbi)
    m.sprintFindMany.mockResolvedValue([sprint])
    m.sbiFindMany.mockResolvedValue([])
  })

  it("proposes adding a PBI that is not in the sprint yet", async () => {
    const out = await run("propose_sprint_pbi", { pbi_id: "#12", action: "add" })
    expect(parseChatProposal(out.proposal)).not.toBeNull()
    expect(out.proposal).toMatchObject({ kind: "sprint_pbi", action: "add", pbi: { id: "pb1", displayId: 12 }, sprint: { id: "s1" } })
    expect(out.proposal.taskCount).toBeUndefined()
  })

  it("proposes removing a member PBI and counts the tasks that go with it", async () => {
    m.sbiFindMany.mockResolvedValue([{ taskName: null }, { taskName: "Design" }, { taskName: "Build" }])
    const out = await run("propose_sprint_pbi", { pbi_id: "12", action: "remove" })
    expect(out.proposal).toMatchObject({ action: "remove", taskCount: 2 })
    expect(out.note).toMatch(/deletes 2 task/)
  })

  it("refuses what makes no sense", async () => {
    m.sbiFindMany.mockResolvedValue([{ taskName: null }])
    expect(await run("propose_sprint_pbi", { pbi_id: "12", action: "add" })).toEqual({ error: expect.stringContaining("already in") })
    m.sbiFindMany.mockResolvedValue([])
    expect(await run("propose_sprint_pbi", { pbi_id: "12", action: "remove" })).toEqual({ error: expect.stringContaining("not in") })
    m.pbiFindFirst.mockResolvedValue({ ...pbi, status: "completed" })
    expect(await run("propose_sprint_pbi", { pbi_id: "12", action: "add" })).toEqual({ error: expect.stringContaining("already completed") })
    expect(await run("propose_sprint_pbi", { pbi_id: "12", action: "swap" })).toEqual({ error: "action must be add | remove" })
    m.pbiFindFirst.mockResolvedValue(null)
    expect(await run("propose_sprint_pbi", { pbi_id: "99", action: "add" })).toEqual({ error: expect.stringContaining("PBI not found") })
    m.pbiFindFirst.mockResolvedValue(pbi)
    m.sprintFindMany.mockResolvedValue([])
    expect(await run("propose_sprint_pbi", { pbi_id: "12", action: "add" })).toEqual({ error: expect.stringContaining("no matching open sprint") })
  })

  it("asks which sprint when a name matches several", async () => {
    m.sprintFindMany.mockResolvedValue([sprint, { id: "s2", sprintName: "Sprint 13" }])
    expect(await run("propose_sprint_pbi", { pbi_id: "12", action: "add", sprint: "Sprint" })).toEqual({ error: expect.stringContaining("ambiguous") })
  })
})
