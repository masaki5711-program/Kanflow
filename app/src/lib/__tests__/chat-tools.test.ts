import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Chat tools run with the caller's projectId. The LLM controls `args`
 * (including ids), so every prisma query must be scoped to projectId —
 * otherwise a prompt could exfiltrate another project's attachments.
 */

const m = vi.hoisted(() => ({
  attFindMany: vi.fn(),
  attFindFirst: vi.fn(),
  extract: vi.fn(),
  sprintFindFirst: vi.fn(),
  sprintFindMany: vi.fn(),
  sbiFindMany: vi.fn(),
  pbiFindMany: vi.fn(),
  iceFindMany: vi.fn(),
  dsFindMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectAttachment: { findMany: m.attFindMany, findFirst: m.attFindFirst },
    sprint: { findFirst: m.sprintFindFirst, findMany: m.sprintFindMany },
    sprintBacklogItem: { findMany: m.sbiFindMany },
    productBacklogItem: { findMany: m.pbiFindMany },
    iceboxItem: { findMany: m.iceFindMany },
    dailyScrumNote: { findMany: m.dsFindMany },
  },
}))
vi.mock("@/lib/attachment-extractor", () => ({ extractAttachment: m.extract }))

const { CHAT_TOOLS, runTool } = await import("@/lib/chat-tools")

/** Attachments owned by two different projects. */
const ATTACHMENTS = [
  { id: "a-mine", projectId: "p1", fileName: "f1.pdf", originalName: "spec.pdf", mimeType: "application/pdf", fileSize: 4096, createdAt: new Date("2026-01-02T00:00:00Z") },
  { id: "a-other", projectId: "p2", fileName: "f2.pdf", originalName: "secret.pdf", mimeType: "application/pdf", fileSize: 2048, createdAt: new Date("2026-01-03T00:00:00Z") },
]

function matchesWhere(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => {
    if (v && typeof v === "object" && "contains" in (v as object)) {
      return String(row[k]).toLowerCase().includes(String((v as { contains: string }).contains).toLowerCase())
    }
    return row[k] === v
  })
}

describe("chat-tools registry", () => {
  it("exposes file tools plus the analysis pack with unique names", () => {
    const names = CHAT_TOOLS.map((t) => t.function.name)
    expect(names).toContain("list_attachments")
    expect(names).toContain("extract_attachment_content")
    expect(names).toContain("get_sprint_metrics")
    expect(new Set(names).size).toBe(names.length)
    for (const t of CHAT_TOOLS) {
      expect(t.type).toBe("function")
      expect(t.function.parameters.type).toBe("object")
    }
  })

  it("returns an error string for an unknown tool", async () => {
    await expect(runTool("drop_database", { projectId: "p1", args: {} })).resolves.toBe(
      "Error: unknown tool drop_database"
    )
  })

  it("converts handler exceptions into an error string", async () => {
    m.attFindMany.mockRejectedValueOnce(new Error("db down"))
    await expect(runTool("list_attachments", { projectId: "p1", args: {} })).resolves.toBe(
      "Error executing list_attachments: db down"
    )
    m.attFindMany.mockRejectedValueOnce("plain")
    await expect(runTool("list_attachments", { projectId: "p1", args: {} })).resolves.toBe(
      "Error executing list_attachments: plain"
    )
  })
})

describe("list_attachments", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.attFindMany.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      ATTACHMENTS.filter((a) => matchesWhere(a, where))
    )
  })

  it("only lists attachments of the caller's project", async () => {
    const out = await runTool("list_attachments", { projectId: "p1", args: {} })
    expect(m.attFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1" })
    expect(out).toContain("id=a-mine")
    expect(out).toContain("spec.pdf | application/pdf | 4 KB | uploaded 2026-01-02")
    expect(out).not.toContain("secret.pdf")
  })

  it("keeps projectId scoping when filtering by name (cannot find another project's file)", async () => {
    const out = await runTool("list_attachments", { projectId: "p1", args: { name_contains: " secret " } })
    expect(m.attFindMany.mock.calls[0][0].where).toEqual({
      projectId: "p1",
      originalName: { contains: "secret" },
    })
    expect(out).toBe("No attachments found.")
  })

  it("ignores a blank or non-string filter", async () => {
    await runTool("list_attachments", { projectId: "p1", args: { name_contains: "  " } })
    await runTool("list_attachments", { projectId: "p1", args: { name_contains: 42 } })
    expect(m.attFindMany.mock.calls[0][0].where).toEqual({ projectId: "p1" })
    expect(m.attFindMany.mock.calls[1][0].where).toEqual({ projectId: "p1" })
  })
})

describe("extract_attachment_content", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    m.attFindFirst.mockImplementation(async ({ where }: { where: Record<string, unknown> }) =>
      ATTACHMENTS.find((a) => matchesWhere(a, where)) ?? null
    )
    m.extract.mockResolvedValue({ ok: true, text: "BODY", format: "pdf", truncated: false })
  })

  it("requires an attachment id", async () => {
    await expect(runTool("extract_attachment_content", { projectId: "p1", args: {} })).resolves.toBe(
      "Error: attachment_id is required."
    )
    expect(m.attFindFirst).not.toHaveBeenCalled()
  })

  it("cannot read an attachment that belongs to another project", async () => {
    const out = await runTool("extract_attachment_content", {
      projectId: "p1",
      args: { attachment_id: "a-other" },
    })
    expect(m.attFindFirst.mock.calls[0][0].where).toEqual({ id: "a-other", projectId: "p1" })
    expect(out).toBe("Error: attachment a-other not found in this project.")
    expect(m.extract).not.toHaveBeenCalled()
  })

  it("extracts content of an own attachment using the caller's projectId", async () => {
    const out = await runTool("extract_attachment_content", {
      projectId: "p1",
      args: { attachment_id: "a-mine" },
    })
    expect(m.extract).toHaveBeenCalledWith({
      projectId: "p1",
      fileName: "f1.pdf",
      mimeType: "application/pdf",
      originalName: "spec.pdf",
    })
    expect(out).toBe("Content of spec.pdf (pdf):\n\nBODY")
  })

  it("marks truncated content and surfaces extraction errors", async () => {
    m.extract.mockResolvedValueOnce({ ok: true, text: "X", format: "docx", truncated: true })
    await expect(
      runTool("extract_attachment_content", { projectId: "p1", args: { attachment_id: "a-mine" } })
    ).resolves.toBe("Content of spec.pdf (docx, truncated):\n\nX")
    m.extract.mockResolvedValueOnce({ ok: false, error: "unsupported format" })
    await expect(
      runTool("extract_attachment_content", { projectId: "p1", args: { attachment_id: "a-mine" } })
    ).resolves.toBe("Error: unsupported format")
  })
})

describe("runTool dispatches analysis tools with the caller's projectId", () => {
  it("routes get_backlog_summary to the analysis pack", async () => {
    m.pbiFindMany.mockResolvedValue([])
    const out = JSON.parse(await runTool("get_backlog_summary", { projectId: "p9", args: {} }))
    expect(out.total_items).toBe(0)
    expect(m.pbiFindMany.mock.calls[0][0].where).toEqual({ projectId: "p9", deletedAt: null })
  })
})
