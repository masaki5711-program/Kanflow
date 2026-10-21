import { beforeEach, describe, expect, it, vi } from "vitest"

const sprintFindFirst = vi.fn()
const gitLinkFindMany = vi.fn()
const isGitEnabled = vi.fn()
const updateTask = vi.fn()

vi.mock("@/lib/prisma", () => ({
  prisma: {
    sprint: { findFirst: (...a: unknown[]) => sprintFindFirst(...a) },
    gitLink: { findMany: (...a: unknown[]) => gitLinkFindMany(...a) },
  },
}))
vi.mock("../git.service", () => ({ isGitEnabled: (...a: unknown[]) => isGitEnabled(...a) }))
vi.mock("@/services/sprint-backlog/sprint-backlog.service", () => ({ updateTask: (...a: unknown[]) => updateTask(...a) }))

const svc = await import("../git-insights.service")

const ACTOR = { userId: "u1", userName: "Alice", systemRole: "member" }
const NOW = new Date("2026-10-21T00:00:00Z")

function pbi(id: string, displayId: number) {
  return { id, displayId, initiative: `Title ${displayId}`, userStory: null }
}
const task = (id: string, status: string, p: ReturnType<typeof pbi>, taskName: string | null = `t-${id}`) => ({ id, taskName, status, pbItem: p })

function sprintWith(items: unknown[]) {
  return {
    sprintName: "S1",
    startDate: new Date("2026-10-05T00:00:00Z"),
    endDate: new Date("2026-10-16T00:00:00Z"),
    items,
  }
}

const openMr = (over: Record<string, unknown> = {}) => ({
  backlogItemId: "b1", kind: "mr", ref: "7", title: "PBI-1 work", url: "https://g/7", state: "opened", pipeline: null, occurredAt: NOW, author: "Yamada", ...over,
})

beforeEach(() => {
  vi.resetAllMocks()
  isGitEnabled.mockResolvedValue(true)
})

describe("getSprintGitInsights", () => {
  it("returns nothing when Git is off, without reading the sprint", async () => {
    isGitEnabled.mockResolvedValue(false)
    expect(await svc.getSprintGitInsights("p1", "s1", NOW)).toEqual({ enabled: false, hints: [] })
    expect(sprintFindFirst).not.toHaveBeenCalled()
  })

  it("suggests starting a PBI whose tasks are all todo once it has an open MR; placeholder rows do not count", async () => {
    const p = pbi("b1", 1)
    sprintFindFirst.mockResolvedValue(sprintWith([task("t1", "todo", p), task("t2", "todo", p, null)]))
    gitLinkFindMany.mockResolvedValue([openMr()])
    const out = await svc.getSprintGitInsights("p1", "s1", NOW)
    expect(out.hints).toEqual([expect.objectContaining({ kind: "start", action: "start", pbItemId: "b1", displayId: 1, title: "Title 1", taskCount: 1 })])
  })

  it("throws 404 for a sprint that is not in the project", async () => {
    sprintFindFirst.mockResolvedValue(null)
    await expect(svc.getSprintGitInsights("p1", "nope", NOW)).rejects.toMatchObject({ status: 404 })
  })
})

describe("applyGitTaskAction", () => {
  it("moves only the todo tasks to in progress when a start suggestion stands", async () => {
    const p = pbi("b1", 1)
    sprintWith([])
    sprintFindFirst.mockResolvedValue(sprintWith([task("t1", "todo", p), task("t2", "todo", p)]))
    gitLinkFindMany.mockResolvedValue([openMr()])
    const out = await svc.applyGitTaskAction("p1", "s1", "b1", "start", ACTOR)
    expect(out).toEqual({ updated: 2 })
    expect(updateTask).toHaveBeenCalledWith("p1", "s1", "t1", { status: "in_progress" }, ACTOR)
    expect(updateTask).toHaveBeenCalledWith("p1", "s1", "t2", { status: "in_progress" }, ACTOR)
  })

  it("completes every open task once all MRs are merged", async () => {
    const p = pbi("b1", 1)
    sprintFindFirst.mockResolvedValue(sprintWith([task("t1", "in_progress", p), task("t2", "done", p)]))
    gitLinkFindMany.mockResolvedValue([openMr({ state: "merged" })])
    expect(await svc.applyGitTaskAction("p1", "s1", "b1", "complete", ACTOR)).toEqual({ updated: 1 })
    expect(updateTask).toHaveBeenCalledTimes(1)
    expect(updateTask).toHaveBeenCalledWith("p1", "s1", "t1", { status: "done" }, ACTOR)
  })

  it("does nothing when the suggestion no longer holds", async () => {
    const p = pbi("b1", 1)
    sprintFindFirst.mockResolvedValue(sprintWith([task("t1", "in_progress", p)]))
    gitLinkFindMany.mockResolvedValue([openMr()])
    expect(await svc.applyGitTaskAction("p1", "s1", "b1", "complete", ACTOR)).toEqual({ updated: 0 })
    expect(updateTask).not.toHaveBeenCalled()
  })
})

describe("getDailyScrumGitDraft", () => {
  it("summarises recent merged / opened MRs and commits per PBI", async () => {
    const p = pbi("b1", 1)
    sprintFindFirst.mockResolvedValue(sprintWith([task("t1", "in_progress", p)]))
    gitLinkFindMany.mockResolvedValue([openMr({ state: "merged" }), openMr({ ref: "8", title: "next" }), { backlogItemId: "b1", kind: "commit", ref: "abc", title: "c", state: null, author: null }])
    const out = await svc.getDailyScrumGitDraft("p1", "s1", "ja", new Date("2026-10-20T01:00:00Z"))
    expect(out.enabled).toBe(true)
    expect(out.text).toContain("直近 24 時間")
    expect(out.text).toContain("PBI-1 Title 1: マージ !7 PBI-1 work (Yamada) / MR 作成 !8 next (Yamada) / コミット 1 件")
    expect(gitLinkFindMany.mock.calls[0][0].where.occurredAt.gte).toEqual(new Date("2026-10-19T01:00:00Z"))
  })
})

describe("getSprintReleaseNote", () => {
  it("lists the MRs merged inside the sprint period, per PBI", async () => {
    const p = pbi("b1", 1)
    sprintFindFirst.mockResolvedValue(sprintWith([task("t1", "done", p)]))
    gitLinkFindMany.mockResolvedValue([{ backlogItemId: "b1", ref: "7", title: "PBI-1 work", url: "https://g/7", author: "Yamada" }])
    const out = await svc.getSprintReleaseNote("p1", "s1", "en")
    expect(out.mergedCount).toBe(1)
    expect(out.text).toContain("# S1 release notes")
    expect(out.text).toContain("- [!7](https://g/7) PBI-1 work (Yamada)")
    const where = gitLinkFindMany.mock.calls[0][0].where
    expect(where).toMatchObject({ kind: "mr", state: "merged" })
    expect(where.mergedAt.lt).toEqual(new Date("2026-10-17T00:00:00Z"))
  })

  it("is disabled without Git", async () => {
    isGitEnabled.mockResolvedValue(false)
    expect(await svc.getSprintReleaseNote("p1", "s1", "ja")).toEqual({ enabled: false, text: "", mergedCount: 0 })
  })
})
