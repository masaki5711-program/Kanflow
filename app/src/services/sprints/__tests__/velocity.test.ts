import { beforeEach, describe, expect, it, vi } from "vitest"

const db = vi.hoisted(() => ({ sprint: { findMany: vi.fn() }, project: { findUnique: vi.fn() } }))
vi.mock("@/services/_shared/db", () => ({ defaultDb: db }))

const { computeVelocity, findVelocitySprints, getVelocity, VELOCITY_STATUSES, VELOCITY_WINDOW } = await import("../velocity")

const d = (s: string) => new Date(`${s}T00:00:00Z`)

function row(id: string, end: string, actualScore: number, capacity = 10) {
  return { id, sprintName: `S-${id}`, status: "done", capacity, actualScore, startDate: d("2026-01-01"), endDate: d(end) }
}

describe("computeVelocity", () => {
  it("returns an empty series and no average without finished sprints", () => {
    expect(computeVelocity([])).toEqual({ sprints: [], average: null })
  })

  it("orders the window oldest → newest and averages the completed points", () => {
    const out = computeVelocity([row("c", "2026-03-01", 8), row("a", "2026-01-15", 3), row("b", "2026-02-01", 4)])
    expect(out.sprints.map((s) => s.id)).toEqual(["a", "b", "c"])
    expect(out.sprints[0]).toEqual({ id: "a", name: "S-a", status: "done", points: 3, capacity: 10, endDate: "2026-01-15T00:00:00.000Z" })
    expect(out.average).toBe(5)
  })

  it("keeps only the newest N sprints and rounds the average to one decimal", () => {
    const rows = Array.from({ length: 10 }, (_, i) => row(`s${i}`, `2026-0${1 + Math.floor(i / 3)}-1${i % 3}`, i + 1))
    const out = computeVelocity(rows, 3)
    expect(out.sprints.map((s) => s.points)).toEqual([8, 9, 10])
    expect(out.average).toBe(9)
    expect(computeVelocity([row("x", "2026-01-01", 1), row("y", "2026-01-02", 2), row("z", "2026-01-03", 2)]).average).toBe(1.7)
  })

  it("treats negative / missing values as zero", () => {
    const out = computeVelocity([{ ...row("a", "2026-01-01", -3), capacity: -1 }])
    expect(out.sprints[0]).toMatchObject({ points: 0, capacity: 0 })
    expect(out.average).toBe(0)
  })

  it("defaults to an 8-sprint window", () => {
    expect(VELOCITY_WINDOW).toBe(8)
    const rows = Array.from({ length: 12 }, (_, i) => row(`s${i}`, `2026-${String(i + 1).padStart(2, "0")}-01`, 1))
    expect(computeVelocity(rows).sprints).toHaveLength(8)
  })
})

describe("findVelocitySprints / getVelocity", () => {
  beforeEach(() => vi.clearAllMocks())

  it("queries finished sprints of the project, newest end date first, bounded", async () => {
    const findMany = vi.fn(async () => [])
    await findVelocitySprints({ sprint: { findMany } } as never, "p1", 8)
    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: "p1", status: { in: [...VELOCITY_STATUSES] } },
      select: { id: true, sprintName: true, status: true, capacity: true, actualScore: true, startDate: true, endDate: true },
      orderBy: [{ endDate: "desc" }, { createdAt: "desc" }],
      take: 8,
    })
    expect(VELOCITY_STATUSES).toEqual(["review", "done", "archived"])
  })

  it("getVelocity combines the series with the project point unit", async () => {
    db.sprint.findMany.mockResolvedValue([row("a", "2026-01-15", 6)])
    db.project.findUnique.mockResolvedValue({ pointUnit: "pt" })
    await expect(getVelocity("p1")).resolves.toMatchObject({ average: 6, pointUnit: "pt", sprints: [{ id: "a", points: 6 }] })
    expect(db.project.findUnique).toHaveBeenCalledWith({ where: { id: "p1" }, select: { pointUnit: true } })
  })

  it("getVelocity falls back to SP when the project row is missing", async () => {
    db.sprint.findMany.mockResolvedValue([])
    db.project.findUnique.mockResolvedValue(null)
    await expect(getVelocity("p1")).resolves.toEqual({ sprints: [], average: null, pointUnit: "SP" })
  })
})
