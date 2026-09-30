import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("../sections.repository")
vi.mock("@/services/categories/categories.repository")

const sectionsRepo = await import("../sections.repository")
const categoriesRepo = await import("@/services/categories/categories.repository")
const { DEFAULT_DB, prismaError } = await import("@/services/__tests__/support")
const sections = await import("../sections.service")
const categories = await import("@/services/categories/categories.service")
const { parseSectionFilter } = await import("@/services/categories/categories.schemas")

describe("sections.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("lists admin rows and picker options", async () => {
    vi.mocked(sectionsRepo.findSectionsWithCounts).mockResolvedValue([{ id: "s" }] as never)
    vi.mocked(sectionsRepo.findSectionOptions).mockResolvedValue([{ id: "s", name: "S" }])
    expect(await sections.listSections()).toEqual([{ id: "s" }])
    expect(await sections.listSectionOptions()).toEqual([{ id: "s", name: "S" }])
  })

  it("creates with defaults and maps duplicates to 409", async () => {
    vi.mocked(sectionsRepo.insertSection).mockResolvedValueOnce({ id: "s" } as never)
    await sections.createSection({ name: "A" })
    expect(sectionsRepo.insertSection).toHaveBeenCalledWith(DEFAULT_DB, { name: "A", description: null, sortOrder: 0 })
    vi.mocked(sectionsRepo.insertSection).mockRejectedValueOnce(prismaError("P2002"))
    await expect(sections.createSection({ name: "A" })).rejects.toMatchObject({ status: 409, message: "duplicate_name" })
  })

  it("maps missing rows to not_found on update / delete", async () => {
    vi.mocked(sectionsRepo.updateSection).mockRejectedValueOnce(prismaError("P2025"))
    await expect(sections.updateSection("x", { name: "B" })).rejects.toMatchObject({ status: 404, message: "not_found" })
    vi.mocked(sectionsRepo.deleteSection).mockRejectedValueOnce(prismaError("P2025"))
    await expect(sections.deleteSection("x")).rejects.toMatchObject({ status: 404 })
    vi.mocked(sectionsRepo.updateSection).mockResolvedValueOnce({ id: "x" } as never)
    await expect(sections.updateSection("x", {})).resolves.toEqual({ id: "x" })
    await expect(sections.deleteSection("x")).resolves.toBeUndefined()
  })
})

describe("categories.service", () => {
  beforeEach(() => vi.clearAllMocks())

  it("parses the section filter", () => {
    expect(parseSectionFilter(null)).toEqual({ kind: "all" })
    expect(parseSectionFilter("")).toEqual({ kind: "global" })
    expect(parseSectionFilter("s1")).toEqual({ kind: "section", sectionId: "s1" })
  })

  it("lists, creates with defaults and maps prisma errors", async () => {
    vi.mocked(categoriesRepo.findAdminCategories).mockResolvedValue([] as never)
    await categories.listAdminCategories({ kind: "global" })
    expect(categoriesRepo.findAdminCategories).toHaveBeenCalledWith(DEFAULT_DB, { kind: "global" })
    vi.mocked(categoriesRepo.insertAdminCategory).mockResolvedValueOnce({ id: "c" } as never)
    await categories.createAdminCategory({ name: "N" })
    expect(categoriesRepo.insertAdminCategory).toHaveBeenCalledWith(DEFAULT_DB, { name: "N", color: "gray", sortOrder: 0, sectionId: null })
    vi.mocked(categoriesRepo.insertAdminCategory).mockRejectedValueOnce(prismaError("P2002"))
    await expect(categories.createAdminCategory({ name: "N" })).rejects.toMatchObject({ status: 409 })
    vi.mocked(categoriesRepo.updateAdminCategory).mockRejectedValueOnce(prismaError("P2025"))
    await expect(categories.updateAdminCategory("c", {})).rejects.toMatchObject({ status: 404 })
    vi.mocked(categoriesRepo.updateAdminCategory).mockResolvedValueOnce({ id: "c" } as never)
    await expect(categories.updateAdminCategory("c", { color: "red" })).resolves.toEqual({ id: "c" })
    vi.mocked(categoriesRepo.deleteAdminCategory).mockRejectedValueOnce(new Error("db down"))
    await expect(categories.deleteAdminCategory("c")).rejects.toThrow("db down")
    await expect(categories.deleteAdminCategory("c")).resolves.toBeUndefined()
  })
})
