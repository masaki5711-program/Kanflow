import { beforeEach, describe, expect, it, vi } from "vitest"

const m = vi.hoisted(() => ({
  findExpiredTrashedProjects: vi.fn(),
  findExpiredTrashedBacklogItems: vi.fn(),
  findExpiredTrashedIceboxItems: vi.fn(),
  purgeProject: vi.fn(),
  purgeBacklogItem: vi.fn(),
  purgeIceboxItem: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { __db: true } }))
vi.mock("@/services/projects/projects.repository", () => ({ findExpiredTrashedProjects: m.findExpiredTrashedProjects }))
vi.mock("@/services/backlog/backlog.repository", () => ({ findExpiredTrashedBacklogItems: m.findExpiredTrashedBacklogItems }))
vi.mock("@/services/icebox/icebox.repository", () => ({ findExpiredTrashedIceboxItems: m.findExpiredTrashedIceboxItems }))
vi.mock("@/services/projects/projects.service", () => ({ purgeProject: m.purgeProject }))
vi.mock("@/services/backlog/backlog.service", () => ({ purgeBacklogItem: m.purgeBacklogItem }))
vi.mock("@/services/icebox/icebox.service", () => ({ purgeIceboxItem: m.purgeIceboxItem }))

const { runPurgeTrash, PURGE_TRASH_MAX_PER_TYPE } = await import("@/worker/jobs/purge-trash")

const NOW = new Date("2026-10-31T03:30:00Z")
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  m.findExpiredTrashedProjects.mockResolvedValue([])
  m.findExpiredTrashedBacklogItems.mockResolvedValue([])
  m.findExpiredTrashedIceboxItems.mockResolvedValue([])
  m.purgeProject.mockResolvedValue(undefined)
  m.purgeBacklogItem.mockResolvedValue(undefined)
  m.purgeIceboxItem.mockResolvedValue(undefined)
})

describe("runPurgeTrash", () => {
  it("purges rows trashed before now - retentionDays through the normal hard-delete paths", async () => {
    m.findExpiredTrashedProjects.mockResolvedValue([{ id: "p9" }])
    m.findExpiredTrashedBacklogItems.mockResolvedValue([{ id: "b1", projectId: "p1" }])
    m.findExpiredTrashedIceboxItems.mockResolvedValue([{ id: "i1", projectId: "p1" }])

    const r = await runPurgeTrash({ retentionDays: 30, now: () => NOW, log })

    const cutoff = new Date("2026-10-01T03:30:00Z")
    expect(m.findExpiredTrashedProjects).toHaveBeenCalledWith({ __db: true }, cutoff, PURGE_TRASH_MAX_PER_TYPE)
    expect(m.findExpiredTrashedBacklogItems).toHaveBeenCalledWith({ __db: true }, cutoff, PURGE_TRASH_MAX_PER_TYPE)
    expect(m.findExpiredTrashedIceboxItems).toHaveBeenCalledWith({ __db: true }, cutoff, PURGE_TRASH_MAX_PER_TYPE)
    expect(m.purgeProject).toHaveBeenCalledWith("p9")
    expect(m.purgeBacklogItem).toHaveBeenCalledWith("p1", "b1", null)
    expect(m.purgeIceboxItem).toHaveBeenCalledWith("p1", "i1", null)
    expect(r).toEqual({
      status: "done",
      cutoff: cutoff.toISOString(),
      purged: { projects: 1, backlogItems: 1, iceboxItems: 1 },
      failed: 0,
    })
  })

  it("purges projects before items (their trashed items go with them)", async () => {
    const order: string[] = []
    m.findExpiredTrashedProjects.mockImplementation(async () => (order.push("projects"), []))
    m.findExpiredTrashedBacklogItems.mockImplementation(async () => (order.push("pbis"), []))
    m.findExpiredTrashedIceboxItems.mockImplementation(async () => (order.push("icebox"), []))
    await runPurgeTrash({ retentionDays: 30, now: () => NOW, log })
    expect(order).toEqual(["projects", "pbis", "icebox"])
  })

  it("keeps going when one row fails and reports it", async () => {
    m.findExpiredTrashedBacklogItems.mockResolvedValue([
      { id: "b1", projectId: "p1" },
      { id: "b2", projectId: "p1" },
    ])
    m.purgeBacklogItem.mockRejectedValueOnce(new Error("lock wait timeout"))
    const r = await runPurgeTrash({ retentionDays: 30, now: () => NOW, log })
    expect(m.purgeBacklogItem).toHaveBeenCalledTimes(2)
    expect(r.purged.backlogItems).toBe(1)
    expect(r.failed).toBe(1)
    expect(log.error).toHaveBeenCalledWith(
      "purge-trash: row failed",
      expect.objectContaining({ entity: "backlog_item", id: "b1", error: "lock wait timeout" })
    )
  })

  it("stops between rows when aborted", async () => {
    const ctrl = new AbortController()
    m.findExpiredTrashedBacklogItems.mockResolvedValue([
      { id: "b1", projectId: "p1" },
      { id: "b2", projectId: "p1" },
    ])
    m.purgeBacklogItem.mockImplementation(async () => ctrl.abort())
    const r = await runPurgeTrash({ retentionDays: 30, now: () => NOW, log, signal: ctrl.signal })
    expect(m.purgeBacklogItem).toHaveBeenCalledTimes(1)
    expect(m.findExpiredTrashedIceboxItems).not.toHaveBeenCalled()
    expect(r.status).toBe("aborted")
  })

  it("warns when a type hit the per-run cap (the rest waits for the next run)", async () => {
    m.findExpiredTrashedIceboxItems.mockResolvedValue(
      Array.from({ length: PURGE_TRASH_MAX_PER_TYPE }, (_, i) => ({ id: `i${i}`, projectId: "p1" }))
    )
    await runPurgeTrash({ retentionDays: 30, now: () => NOW, log })
    expect(log.warn).toHaveBeenCalledWith("purge-trash: per-run cap reached; the rest is purged next run", {
      entity: "icebox_item",
      cap: PURGE_TRASH_MAX_PER_TYPE,
    })
  })
})
