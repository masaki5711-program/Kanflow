import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/services/_shared/db", async () => (await import("@/services/__tests__/support")).dbMock())
vi.mock("@/lib/prisma", () => ({ prisma: {} }))
vi.mock("../plan-templates.repository")

const repo = await import("../plan-templates.repository")
const { ACTOR, TX } = await import("@/services/__tests__/support")
const { BUILTIN_TEMPLATES, builtinByKey } = await import("@/lib/plan-templates/builtins")
const svc = await import("../plan-templates.service")
type Row = import("../plan-templates.dto").TemplateRow

const ADMIN = { ...ACTOR, userId: "admin", systemRole: "admin" }
const OTHER = { ...ACTOR, userId: "u2", userName: "Bob" }
const CONTENT = { stages: [{ name: "企画", durationDays: 3 }] }

function row(over: Partial<Row> = {}): Row {
  return {
    id: "t1",
    builtinKey: null,
    name: "My template",
    description: null,
    visibility: "public",
    ownerId: "u1",
    ownerName: "Alice",
    content: JSON.stringify(CONTENT),
    version: 2,
    createdAt: new Date("2026-10-01T00:00:00Z"),
    updatedAt: new Date("2026-10-02T00:00:00Z"),
    updatedById: "u1",
    updatedByName: "Alice",
    deletedAt: null,
    ...over,
  }
}

describe("plan-templates.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    svc.resetBuiltinSeedFlag()
    vi.mocked(repo.findBuiltinKeys).mockResolvedValue(BUILTIN_TEMPLATES.map((b) => ({ builtinKey: b.key })))
    vi.mocked(repo.insertRevision).mockResolvedValue({ id: "r1" })
    vi.mocked(repo.pruneRevisions).mockResolvedValue()
  })

  it("seeds missing built-ins once (with a create revision) and lists built-ins first", async () => {
    vi.mocked(repo.findBuiltinKeys).mockResolvedValue([{ builtinKey: "equipment" }])
    vi.mocked(repo.insertTemplate).mockImplementation((async (_db: unknown, data: { builtinKey?: string | null }) => row({ id: `b-${data.builtinKey}`, builtinKey: data.builtinKey ?? null, ownerId: null })) as never)
    vi.mocked(repo.findVisibleTemplates).mockResolvedValue([
      row({ id: "mine", updatedAt: new Date("2026-10-05T00:00:00Z") }),
      row({ id: "b-it", builtinKey: "it", ownerId: null }),
      row({ id: "b-eq", builtinKey: "equipment", ownerId: null }),
    ] as never)
    const list = await svc.listTemplates(ACTOR)
    expect(repo.insertTemplate).toHaveBeenCalledTimes(BUILTIN_TEMPLATES.length - 1)
    expect(repo.insertRevision).toHaveBeenCalledWith(TX, expect.objectContaining({ action: "create" }))
    expect(list.map((t) => t.id)).toEqual(["b-eq", "b-it", "mine"])
    expect(list[2]).toMatchObject({ isMine: true, canDelete: true, stageCount: 1, hasDurations: true })
    await svc.listTemplates(ACTOR)
    expect(repo.findBuiltinKeys).toHaveBeenCalledTimes(1)
  })

  it("a private template is invisible (404) to others but visible to its owner and admins", async () => {
    vi.mocked(repo.findTemplate).mockResolvedValue(row({ visibility: "private" }) as never)
    await expect(svc.getTemplate("t1", OTHER)).rejects.toMatchObject({ status: 404, code: "PLAN_TEMPLATE_NOT_FOUND" })
    await expect(svc.getTemplate("t1", ACTOR)).resolves.toMatchObject({ id: "t1", content: CONTENT })
    await expect(svc.getTemplate("t1", ADMIN)).resolves.toMatchObject({ id: "t1" })
  })

  it("anyone may edit a public template; the save is versioned and recorded as a revision", async () => {
    vi.mocked(repo.findTemplate).mockResolvedValue(row() as never)
    vi.mocked(repo.updateTemplateVersioned).mockResolvedValue(row({ version: 3, name: "Renamed", updatedByName: "Bob" }) as never)
    const out = await svc.updateTemplate("t1", { name: "Renamed", content: CONTENT, version: 2 }, OTHER)
    expect(repo.updateTemplateVersioned).toHaveBeenCalledWith(TX, "t1", expect.objectContaining({ name: "Renamed", updatedById: "u2", updatedByName: "Bob" }), 2)
    expect(repo.insertRevision).toHaveBeenCalledWith(TX, expect.objectContaining({ action: "update", version: 3, editedByName: "Bob" }))
    expect(out).toMatchObject({ version: 3, isMine: false, canDelete: false })
  })

  it("a stale version answers 409 VERSION_CONFLICT with the current template", async () => {
    vi.mocked(repo.findTemplate).mockResolvedValue(row({ version: 5 }) as never)
    await expect(svc.updateTemplate("t1", { name: "x", content: CONTENT, version: 2 }, ACTOR)).rejects.toMatchObject({
      status: 409,
      code: "VERSION_CONFLICT",
      current: expect.objectContaining({ version: 5 }),
    })
    expect(repo.updateTemplateVersioned).not.toHaveBeenCalled()
  })

  it("only the owner / an admin may change visibility (403); built-ins never", async () => {
    vi.mocked(repo.findTemplate).mockResolvedValue(row() as never)
    await expect(svc.updateTemplate("t1", { name: "x", content: CONTENT, visibility: "private" }, OTHER)).rejects.toMatchObject({ status: 403 })
    vi.mocked(repo.findTemplate).mockResolvedValue(row({ builtinKey: "it", ownerId: null }) as never)
    await expect(svc.updateTemplate("t1", { name: "x", content: CONTENT, visibility: "private" }, ADMIN)).rejects.toMatchObject({ status: 403 })
    // Sending the unchanged visibility is fine for anyone.
    vi.mocked(repo.findTemplate).mockResolvedValue(row() as never)
    vi.mocked(repo.updateTemplateVersioned).mockResolvedValue(row({ version: 3 }) as never)
    await expect(svc.updateTemplate("t1", { name: "x", content: CONTENT, visibility: "public" }, OTHER)).resolves.toMatchObject({ version: 3 })
  })

  it("delete: built-ins → 400; others' templates → 403; owner and admin may", async () => {
    vi.mocked(repo.softDeleteTemplate).mockResolvedValue(true)
    vi.mocked(repo.findTemplate).mockResolvedValue(row({ builtinKey: "equipment", ownerId: null }) as never)
    await expect(svc.deleteTemplate("t1", ADMIN)).rejects.toMatchObject({ status: 400, code: "PLAN_TEMPLATE_BUILTIN" })
    vi.mocked(repo.findTemplate).mockResolvedValue(row() as never)
    await expect(svc.deleteTemplate("t1", OTHER)).rejects.toMatchObject({ status: 403, code: "PLAN_TEMPLATE_DELETE_FORBIDDEN" })
    await expect(svc.deleteTemplate("t1", ACTOR)).resolves.toBeUndefined()
    await expect(svc.deleteTemplate("t1", ADMIN)).resolves.toBeUndefined()
    expect(repo.softDeleteTemplate).toHaveBeenCalledTimes(2)
  })

  it("reset restores the shipped content of a built-in (reset revision); user templates → 400", async () => {
    const eq = builtinByKey("equipment")!
    vi.mocked(repo.findTemplate).mockResolvedValue(row({ builtinKey: "equipment", ownerId: null, name: "Edited", content: JSON.stringify(CONTENT) }) as never)
    vi.mocked(repo.updateTemplateVersioned).mockImplementation((async (_db: unknown, _id: unknown, data: unknown) => row({ builtinKey: "equipment", ...(data as object), version: 3 } as Partial<Row>)) as never)
    const out = await svc.resetTemplate("t1", 2, OTHER)
    expect(out.name).toBe(eq.name)
    expect(out.content).toEqual(eq.content)
    expect(repo.insertRevision).toHaveBeenCalledWith(TX, expect.objectContaining({ action: "reset" }))
    vi.mocked(repo.findTemplate).mockResolvedValue(row() as never)
    await expect(svc.resetTemplate("t1", undefined, ACTOR)).rejects.toMatchObject({ code: "PLAN_TEMPLATE_NOT_BUILTIN" })
  })

  it("duplicate copies any visible template into one owned by the caller", async () => {
    vi.mocked(repo.findTemplate).mockResolvedValue(row({ builtinKey: "it", ownerId: null, name: "IT導入" }) as never)
    vi.mocked(repo.insertTemplate).mockImplementation((async (_db: unknown, data: { builtinKey?: string | null }) => row({ id: "copy", ...(data as object), version: 0 } as Partial<Row>)) as never)
    const out = await svc.duplicateTemplate("t1", { visibility: "private" }, OTHER)
    expect(repo.insertTemplate).toHaveBeenCalledWith(TX, expect.objectContaining({ name: "IT導入（コピー）", ownerId: "u2", visibility: "private" }))
    expect(out).toMatchObject({ id: "copy", isMine: true, canDelete: true })
  })

  it("revisions: list without content, one revision with content; hidden templates → 404", async () => {
    vi.mocked(repo.findTemplate).mockResolvedValue(row() as never)
    const rev = { id: "r1", templateId: "t1", version: 2, name: "n", description: null, visibility: "public", action: "update", editedById: "u2", editedByName: "Bob", editedAt: new Date("2026-10-03T00:00:00Z") }
    vi.mocked(repo.findRevisions).mockResolvedValue([rev] as never)
    vi.mocked(repo.findRevision).mockResolvedValue({ ...rev, content: JSON.stringify(CONTENT) } as never)
    expect(await svc.listRevisions("t1", ACTOR)).toEqual([expect.not.objectContaining({ content: expect.anything() })])
    expect((await svc.listRevisions("t1", ACTOR, "r1"))[0]).toMatchObject({ editedBy: { id: "u2", name: "Bob" }, content: CONTENT })
    vi.mocked(repo.findTemplate).mockResolvedValue(row({ visibility: "private" }) as never)
    await expect(svc.listRevisions("t1", OTHER)).rejects.toMatchObject({ status: 404 })
  })

  it("oversized content → 413", () => {
    const stages = Array.from({ length: 200 }, (_, i) => ({ name: `${"x".repeat(250)}${i}`, description: "y".repeat(2000) }))
    expect(() => svc.contentJson({ stages })).toThrow(expect.objectContaining({ status: 413 }))
  })
})
