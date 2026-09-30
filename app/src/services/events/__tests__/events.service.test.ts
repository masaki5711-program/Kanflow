import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../events.repository")

const repo = await import("../events.repository")
const tr = await import("@/services/_shared/translations")
const { ACTOR, TX, touchedTranslationFields } = await import("@/services/__tests__/support")
const svc = await import("../events.service")

describe("events.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists with i18n", async () => {
    vi.mocked(repo.findEvents).mockResolvedValue([{ id: "e1" }] as never)
    await expect(svc.listEvents("p1")).resolves.toEqual([{ id: "e1", i18n: {} }])
  })

  it("creates with defaults and enqueues", async () => {
    vi.mocked(repo.insertEvent).mockResolvedValue({ id: "e1" } as never)
    await svc.createEvent("p1", { title: "T", date: "2026-01-01", sprintId: "" }, ACTOR)
    expect(repo.insertEvent).toHaveBeenCalledWith(TX, expect.objectContaining({
      color: "blue",
      allDay: true,
      sprintId: null,
      endDate: null,
      createdBy: "Alice",
    }))
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "calendar_event", "e1", { id: "e1" })
    await expect(svc.createEvent("p1", { title: "T", date: "x" }, ACTOR)).rejects.toMatchObject({ status: 400 })
  })

  it("buildEventUpdate normalizes dates and sprint", () => {
    expect(svc.buildEventUpdate({ endDate: null, sprintId: "" })).toEqual({ endDate: null, sprintId: null })
    expect(svc.buildEventUpdate({ date: "2026-01-01" })).toEqual({ date: new Date("2026-01-01") })
  })

  it("updates and deletes transactionally", async () => {
    vi.mocked(repo.updateEvent).mockResolvedValue({ id: "e1" } as never)
    await svc.updateEvent("p1", "e1", { title: "N" }, ACTOR)
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "calendar_event", "e1", { title: "N" })
    await svc.deleteEvent("p1", "e1")
    expect(repo.deleteEvent).toHaveBeenCalledWith(TX, "p1", "e1")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { calendar_event: ["e1"] })
  })

  it("create verifies the linked sprint belongs to the project", async () => {
    vi.mocked(repo.findProjectSprintId).mockResolvedValue({ id: "s1" } as never)
    vi.mocked(repo.insertEvent).mockResolvedValue({ id: "e1" } as never)
    await svc.createEvent("p1", { title: "T", date: "2026-01-01", sprintId: "s1" }, ACTOR)
    expect(repo.findProjectSprintId).toHaveBeenCalledWith(TX, "p1", "s1")
    expect(repo.insertEvent).toHaveBeenCalledWith(TX, expect.objectContaining({ sprintId: "s1" }))
  })

  it("create rejects a sprint from another project with 404 and writes nothing", async () => {
    vi.mocked(repo.findProjectSprintId).mockResolvedValue(null)
    await expect(
      svc.createEvent("p1", { title: "T", date: "2026-01-01", sprintId: "foreign" }, ACTOR),
    ).rejects.toMatchObject({ status: 404, message: "Sprint not found" })
    expect(repo.insertEvent).not.toHaveBeenCalled()
    expect(tr.enqueueIn).not.toHaveBeenCalled()
  })

  it("update rejects a foreign sprint with 404 but allows detaching without a lookup", async () => {
    vi.mocked(repo.findProjectSprintId).mockResolvedValue(null)
    await expect(svc.updateEvent("p1", "e1", { sprintId: "foreign" }, ACTOR)).rejects.toMatchObject({ status: 404 })
    expect(repo.updateEvent).not.toHaveBeenCalled()

    vi.mocked(repo.updateEvent).mockResolvedValue({ id: "e1" } as never)
    await svc.updateEvent("p1", "e1", { sprintId: "" }, ACTOR)
    await svc.updateEvent("p1", "e1", { sprintId: null }, ACTOR)
    await svc.updateEvent("p1", "e1", { title: "N" }, ACTOR)
    expect(repo.findProjectSprintId).toHaveBeenCalledTimes(1)
    expect(repo.updateEvent).toHaveBeenCalledTimes(3)
  })
})

describe("A3-02: partial updates keep translations", () => {
  beforeEach(() => vi.clearAllMocks())

  it("moving an event (text keys undefined) touches no FieldTranslation row", async () => {
    vi.mocked(repo.updateEvent).mockResolvedValue({ id: "e1" } as never)
    await svc.updateEvent("p1", "e1", { date: "2026-01-02", title: undefined, description: undefined }, ACTOR)
    expect(touchedTranslationFields(tr.enqueueIn)).toEqual([])
  })
})
