import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/services/_shared/translations", async () => (await import("@/services/__tests__/support")).translationMock())
vi.mock("../user-categories.repository")
vi.mock("@/services/fixed-tasks/fixed-tasks.repository")

const catRepo = await import("../user-categories.repository")
const ftRepo = await import("@/services/fixed-tasks/fixed-tasks.repository")
const tr = await import("@/services/_shared/translations")
const { TX, DEFAULT_DB } = await import("@/services/__tests__/support")
const cats = await import("../user-categories.service")
const fixed = await import("@/services/fixed-tasks/fixed-tasks.service")

describe("user-categories.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("rejects duplicate names on create and rename", async () => {
    vi.mocked(catRepo.findCategoryByName).mockResolvedValueOnce({ id: "c0" })
    await expect(cats.createUserCategory("u1", { name: "A", color: "red" })).rejects.toMatchObject({ status: 409 })
    vi.mocked(catRepo.findOwnedCategory).mockResolvedValueOnce({ id: "c1", name: "B" })
    vi.mocked(catRepo.findCategoryByName).mockResolvedValueOnce({ id: "c0" })
    await expect(cats.updateUserCategory("u1", "c1", { name: "A" })).rejects.toMatchObject({ status: 409 })
  })

  it("creates at the end of the list", async () => {
    vi.mocked(catRepo.findCategoryByName).mockResolvedValue(null)
    vi.mocked(catRepo.nextCategorySortOrder).mockResolvedValue(4)
    await cats.createUserCategory("u1", { name: "A", color: "red" })
    expect(catRepo.insertUserCategory).toHaveBeenCalledWith(TX, { userId: "u1", name: "A", color: "red", sortOrder: 4 })
  })

  it("only touches the caller's own categories", async () => {
    vi.mocked(catRepo.findOwnedCategory).mockResolvedValue(null)
    await expect(cats.deleteUserCategory("u1", "c")).rejects.toMatchObject({ status: 404 })
    await expect(cats.unassignProject("u1", "c", "p")).rejects.toMatchObject({ status: 404 })
    await expect(cats.updateUserCategory("u1", "c", {})).rejects.toMatchObject({ status: 404 })
  })

  it("assigns only member projects", async () => {
    vi.mocked(catRepo.findOwnedCategory).mockResolvedValue({ id: "c", name: "A" })
    vi.mocked(catRepo.findMembership).mockResolvedValueOnce(null)
    await expect(cats.assignProject("u1", "c", "p")).rejects.toMatchObject({ status: 403 })
    vi.mocked(catRepo.findMembership).mockResolvedValueOnce({ id: "m" })
    await cats.assignProject("u1", "c", "p")
    expect(catRepo.upsertAssignment).toHaveBeenCalledWith(DEFAULT_DB, "c", "p")
    await cats.unassignProject("u1", "c", "p")
    await cats.updateUserCategory("u1", "c", { name: "A", color: "x" })
    await cats.deleteUserCategory("u1", "c")
    expect(catRepo.deleteUserCategory).toHaveBeenCalledWith(DEFAULT_DB, "c")
  })
})

describe("fixed-tasks.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists groups with item i18n", async () => {
    vi.mocked(ftRepo.findGroups).mockResolvedValue([{ id: "g", items: [{ id: "i" }] }] as never)
    expect(await fixed.listGroups("u1")).toEqual([{ id: "g", i18n: {}, items: [{ id: "i", i18n: {} }] }])
  })

  it("creates groups and items with translations enqueued in the tx", async () => {
    vi.mocked(ftRepo.nextGroupSortOrder).mockResolvedValue(1)
    vi.mocked(ftRepo.insertGroup).mockResolvedValue({ id: "g" } as never)
    await fixed.createGroup("u1", { taskName: "T" })
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "fixed_task", "g", { id: "g" })
    vi.mocked(ftRepo.findOwnedGroup).mockResolvedValue({ id: "g" })
    vi.mocked(ftRepo.nextItemSortOrder).mockResolvedValue(2)
    vi.mocked(ftRepo.insertItem).mockResolvedValue({ id: "i" } as never)
    await fixed.createItem("u1", "g", { taskName: "I" })
    expect(ftRepo.insertItem).toHaveBeenCalledWith(TX, { groupId: "g", taskName: "I", sortOrder: 2 })
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "fixed_task_item", "i", { id: "i" })
  })

  it("404s for groups / items of other users", async () => {
    vi.mocked(ftRepo.findOwnedGroup).mockResolvedValue(null)
    vi.mocked(ftRepo.findOwnedItem).mockResolvedValue(null)
    await expect(fixed.updateGroup("u1", "g", {})).rejects.toMatchObject({ status: 404 })
    await expect(fixed.deleteGroup("u1", "g")).rejects.toMatchObject({ status: 404 })
    await expect(fixed.createItem("u1", "g", { taskName: "x" })).rejects.toMatchObject({ status: 404 })
    await expect(fixed.updateItem("u1", "g", "i", {})).rejects.toMatchObject({ status: 404 })
    await expect(fixed.deleteItem("u1", "g", "i")).rejects.toMatchObject({ status: 404 })
  })

  it("group delete purges the group and its cascaded items", async () => {
    vi.mocked(ftRepo.findOwnedGroup).mockResolvedValue({ id: "g" })
    vi.mocked(ftRepo.findItemIdsOfGroup).mockResolvedValue([{ id: "i1" }, { id: "i2" }])
    await fixed.deleteGroup("u1", "g")
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { fixed_task: ["g"], fixed_task_item: ["i1", "i2"] })
  })

  it("updates and deletes items / groups", async () => {
    vi.mocked(ftRepo.findOwnedGroup).mockResolvedValue({ id: "g" })
    vi.mocked(ftRepo.findOwnedItem).mockResolvedValue({ id: "i" })
    vi.mocked(ftRepo.updateGroup).mockResolvedValue({ id: "g" } as never)
    vi.mocked(ftRepo.updateItem).mockResolvedValue({ id: "i" } as never)
    await fixed.updateGroup("u1", "g", { taskName: "N" })
    await fixed.updateItem("u1", "g", "i", { sortOrder: 3 })
    await fixed.deleteItem("u1", "g", "i")
    expect(tr.enqueueIn).toHaveBeenCalledWith(TX, "fixed_task", "g", { taskName: "N" })
    expect(tr.purgeIn).toHaveBeenCalledWith(TX, { fixed_task_item: ["i"] })
  })
})
