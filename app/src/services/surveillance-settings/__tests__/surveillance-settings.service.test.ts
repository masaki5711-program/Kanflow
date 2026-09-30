import { beforeEach, describe, expect, it, vi } from "vitest"

const projectFindFirst = vi.fn()
const projectUpdate = vi.fn()
const TX = { project: { findFirst: projectFindFirst, update: projectUpdate } }

vi.mock("@/services/_shared/db", () => ({
  defaultDb: TX,
  withTransaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)),
}))
vi.mock("@/services/_shared/activity", () => ({ logActivity: vi.fn(async () => undefined) }))

const svc = await import("../surveillance-settings.service")
const activity = await import("@/services/_shared/activity")
const { DEFAULT_SURVEILLANCE_SETTINGS } = await import("@/lib/surveillance-settings")
const { NotFoundError } = await import("@/services/_shared/errors")
const ACTOR = { userId: "u1", userName: "Alice", systemRole: "member" }

beforeEach(() => {
  vi.clearAllMocks()
  projectFindFirst.mockResolvedValue({ surveillanceSettings: null })
  projectUpdate.mockResolvedValue({ id: "p1" })
})

describe("getSurveillanceSettings", () => {
  it("returns defaults when nothing is stored, scoped to the live project", async () => {
    expect(await svc.getSurveillanceSettings("p1")).toEqual(DEFAULT_SURVEILLANCE_SETTINGS)
    expect(projectFindFirst).toHaveBeenCalledWith({ where: { id: "p1", deletedAt: null }, select: { surveillanceSettings: true } })
  })

  it("404 when the project is missing or trashed", async () => {
    projectFindFirst.mockResolvedValue(null)
    await expect(svc.getSurveillanceSettings("p1")).rejects.toBeInstanceOf(NotFoundError)
  })
})

describe("updateSurveillanceSettings", () => {
  it("stores the full object and logs only the changed keys", async () => {
    const next = { ...DEFAULT_SURVEILLANCE_SETTINGS, stalledDays: 5, notifyCritical: false }
    expect(await svc.updateSurveillanceSettings("p1", next, ACTOR)).toEqual(next)
    expect(projectUpdate).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { surveillanceSettings: JSON.stringify(next) },
      select: { id: true },
    })
    expect(activity.logActivity).toHaveBeenCalledWith(TX, {
      projectId: "p1",
      entityType: "project",
      entityId: "p1",
      action: "update",
      actor: ACTOR,
      diff: {
        changes: {
          "surveillance.stalledDays": { from: 3, to: 5 },
          "surveillance.notifyCritical": { from: true, to: false },
        },
      },
    })
  })

  it("does not log when nothing changed", async () => {
    await svc.updateSurveillanceSettings("p1", { ...DEFAULT_SURVEILLANCE_SETTINGS }, ACTOR)
    expect(projectUpdate).toHaveBeenCalled()
    expect(activity.logActivity).not.toHaveBeenCalled()
  })

  it("404 without writing when the project is gone", async () => {
    projectFindFirst.mockResolvedValue(null)
    await expect(svc.updateSurveillanceSettings("p1", { ...DEFAULT_SURVEILLANCE_SETTINGS }, ACTOR)).rejects.toBeInstanceOf(NotFoundError)
    expect(projectUpdate).not.toHaveBeenCalled()
  })
})
