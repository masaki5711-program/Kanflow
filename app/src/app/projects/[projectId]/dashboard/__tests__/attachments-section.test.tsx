import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { Attachment, Folder } from "../types"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/lib/image-compress", () => ({ compressImageFile: vi.fn(async (f: File) => f) }))
vi.mock("@/components/media-preview-modal", () => ({
  default: ({ items, startIndex, onClose }: { items: { originalName: string }[]; startIndex: number; onClose: () => void }) => (
    <div role="dialog" aria-label="preview">
      <span>{items.map((i) => i.originalName).join(",")}</span>
      <span data-testid="start">{startIndex}</span>
      <button onClick={onClose}>close-preview</button>
    </div>
  ),
}))

const { AttachmentsSection } = await import("../attachments-section")
const ja = tr("ja")

const att = (id: string, mimeType = "application/pdf", folderId: string | null = null): Attachment => ({
  id, originalName: `${id}.file`, fileName: id, fileSize: 2048, mimeType, folderId, createdAt: "2026-02-03T00:00:00Z",
})
const fold = (id: string, parentId: string | null, sortOrder: number, attachments: Attachment[] = []): Folder => ({ id, name: `Folder ${id}`, parentId, sortOrder, attachments })

function renderSection(folders: Folder[], attachments: Attachment[], language: "ja" | "en" | "id" = "ja") {
  return renderWithProviders(<AttachmentsSection projectId="p1" initialFolders={folders} initialAttachments={attachments} />, { language })
}

describe("AttachmentsSection", () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    stubFetch([{ match: /\/api\/projects\/p1\//, respond: () => jsonResponse({}) }])
  })

  it.each(["ja", "en", "id"] as const)("renders the empty state in %s", (lang) => {
    const t = tr(lang)
    renderSection([], [], lang)
    expect(screen.getByRole("heading", { name: t.dashboardAttachments })).toBeInTheDocument()
    expect(screen.getByText(t.dashboardNoAttachments)).toBeInTheDocument()
  })

  it("renders files with size/date, editor link for office files and download link", () => {
    renderSection([], [att("doc", "application/vnd.ms-excel"), att("pic", "image/png")])
    expect(screen.getByRole("link", { name: "doc.file" })).toHaveAttribute("href", "/api/projects/p1/attachments/doc")
    expect(screen.getByRole("link", { name: ja.edit })).toHaveAttribute("href", "/projects/p1/editor/doc")
    expect(screen.getAllByText("2.0 KB")).toHaveLength(2)
    expect(screen.getAllByText("2026/02/03")).toHaveLength(2)
    expect(screen.getByRole("link", { name: `${ja.dashboardDownload}: doc.file` })).toHaveAttribute("href", "/api/projects/p1/attachments/doc?download=1")
  })

  it("opens the media preview at the clicked item and closes it", async () => {
    const user = userEvent.setup()
    renderSection([], [att("a", "image/png"), att("x"), att("b", "video/mp4")])
    await user.click(screen.getByRole("button", { name: "b.file" }))
    const dialog = screen.getByRole("dialog", { name: "preview" })
    expect(within(dialog).getByText("a.file,b.file")).toBeInTheDocument()
    expect(screen.getByTestId("start")).toHaveTextContent("1")
    await user.click(screen.getByText("close-preview"))
    expect(screen.queryByRole("dialog", { name: "preview" })).not.toBeInTheDocument()
  })

  it("keyboard up/down buttons reorder files; edge buttons are disabled", async () => {
    const user = userEvent.setup()
    renderSection([], [att("a"), att("b")])
    expect(screen.getByRole("button", { name: `${ja.dashboardMoveUp}: a.file` })).toBeDisabled()
    expect(screen.getByRole("button", { name: `${ja.dashboardMoveDown}: b.file` })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: `${ja.dashboardMoveDown}: a.file` }))
    const names = () => screen.getAllByRole("link").filter((l) => l.textContent?.endsWith(".file")).map((l) => l.textContent)
    await waitFor(() => expect(names()).toEqual(["b.file", "a.file"]))
  })

  it("moves a file into a folder via the Move select and back to unfiled", async () => {
    const user = userEvent.setup()
    renderSection([fold("f1", null, 0)], [att("a")])
    await user.selectOptions(screen.getByRole("combobox", { name: `${ja.folderMoveTo} a.file` }), "f1")
    const folderSelect = await screen.findByRole("combobox", { name: `${ja.folderMoveTo} a.file` })
    expect(within(folderSelect).getByRole("option", { name: ja.folderUnfiled })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: new RegExp(`Folder f1.*\\(1\\)`) })).toBeInTheDocument()
    await user.selectOptions(folderSelect, "__unfiled__")
    await waitFor(() => expect(screen.getByRole("button", { name: new RegExp(`Folder f1.*\\(0\\)`) })).toBeInTheDocument())
  })

  it("confirms before deleting a file", async () => {
    const user = userEvent.setup()
    renderSection([], [att("a")])
    await user.click(screen.getByRole("button", { name: `${ja.delete}: a.file` }))
    const dialog = await screen.findByRole("alertdialog")
    expect(dialog).toHaveTextContent(ja.dashboardDeleteAttachmentConfirm)
    await user.click(within(dialog).getByRole("button", { name: ja.delete }))
    await waitFor(() => expect(screen.queryByText("a.file")).not.toBeInTheDocument())
  })

  it("creates a root folder and a subfolder", async () => {
    const user = userEvent.setup()
    let n = 0
    stubFetch([{ match: "/api/projects/p1/folders", method: "POST", respond: async (_u, init) => {
      const body = JSON.parse(init!.body as string)
      n += 1
      return jsonResponse({ id: `new${n}`, name: body.name, parentId: body.parentId })
    } }])
    renderSection([fold("f1", null, 0)], [])
    await user.click(screen.getByRole("button", { name: ja.folderNew }))
    const createBtn = screen.getByRole("button", { name: ja.create })
    expect(createBtn).toBeDisabled()
    await user.type(screen.getByRole("textbox", { name: ja.folderName }), "Docs")
    await user.click(createBtn)
    expect(await screen.findByRole("button", { name: /^Docs/ })).toBeInTheDocument()
    expect(screen.queryByRole("textbox", { name: ja.folderName })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: `${ja.folderAddSubfolder}: Folder f1` }))
    expect(screen.getByText(ja.folderCreateIn.replace("{name}", "Folder f1"))).toBeInTheDocument()
    await user.type(screen.getByRole("textbox", { name: ja.folderName }), "Child")
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("button", { name: /^Child/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: ja.folderNew }))
    await user.click(screen.getByRole("button", { name: ja.cancel }))
    expect(screen.queryByRole("textbox", { name: ja.folderName })).not.toBeInTheDocument()
  })

  it("keeps the new-folder form open when creation fails", async () => {
    const user = userEvent.setup()
    stubFetch([{ match: "/api/projects/p1/folders", method: "POST", respond: () => jsonResponse({ error: "nope" }, 400) }])
    renderSection([], [])
    await user.click(screen.getByRole("button", { name: ja.folderNew }))
    await user.type(screen.getByRole("textbox", { name: ja.folderName }), "X")
    await user.click(screen.getByRole("button", { name: ja.create }))
    expect(await screen.findByText("nope")).toBeInTheDocument()
    expect(screen.getByRole("textbox", { name: ja.folderName })).toHaveValue("X")
  })

  it("collapses/expands folders and renames with Enter, cancels with Escape", async () => {
    const user = userEvent.setup()
    renderSection([fold("f1", null, 0)], [])
    const toggle = screen.getByRole("button", { name: /^Folder f1/ })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(ja.folderNoFiles)).toBeInTheDocument()
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByText(ja.folderNoFiles)).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: ja.folderEditName }))
    const input = screen.getByRole("textbox", { name: ja.folderEditName })
    await user.clear(input)
    await user.type(input, "Renamed{Enter}")
    expect(await screen.findByRole("button", { name: /^Renamed/ })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: ja.folderEditName }))
    await user.type(screen.getByRole("textbox", { name: ja.folderEditName }), "zzz{Escape}")
    expect(screen.getByRole("button", { name: /^Renamed/ })).toBeInTheDocument()
  })

  it("folder keyboard move buttons, change-parent select and delete confirm", async () => {
    const user = userEvent.setup()
    renderSection([fold("a", null, 0), fold("b", null, 1), fold("c", "a", 0)], [])
    expect(screen.getByRole("button", { name: `${ja.dashboardMoveUp}: Folder a` })).toBeDisabled()
    await user.click(screen.getByRole("button", { name: `${ja.dashboardMoveUp}: Folder b` }))
    await waitFor(() => {
      const headers = screen.getAllByRole("button", { name: /^Folder [ab]/ }).map((b) => b.textContent?.slice(0, 8))
      expect(headers).toEqual(["Folder b", "Folder a"])
    })

    // Nested folder can go back to root; a folder can't be moved into itself.
    const cSelect = screen.getByRole("combobox", { name: `${ja.folderChangeParent} Folder c` })
    expect(within(cSelect).getByRole("option", { name: ja.folderRoot })).toBeInTheDocument()
    const aSelect = screen.getByRole("combobox", { name: `${ja.folderChangeParent} Folder a` })
    expect(within(aSelect).queryByRole("option", { name: /Folder c/ })).not.toBeInTheDocument()
    await user.selectOptions(cSelect, "__root__")
    await waitFor(() => expect(screen.getByRole("button", { name: `${ja.dashboardMoveDown}: Folder c` })).toBeDisabled())

    await user.click(screen.getByRole("button", { name: `${ja.folderDeleteTitle}: Folder b` }))
    const dialog = await screen.findByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: ja.delete }))
    await waitFor(() => expect(screen.queryByText("Folder b")).not.toBeInTheDocument())
  })

  it("uploads via the hidden inputs (root and folder)", async () => {
    const posts: (string | null)[] = []
    stubFetch([{ match: "/api/projects/p1/attachments", method: "POST", respond: async (_u, init) => {
      const fd = init!.body as FormData
      posts.push((fd.get("folderId") as string) ?? null)
      return jsonResponse(att(`up${posts.length}`))
    } }])
    const { container } = renderSection([fold("f1", null, 0)], [])
    const inputs = container.querySelectorAll<HTMLInputElement>("input[type=file]")
    const user = userEvent.setup()
    await user.click(screen.getByRole("button", { name: ja.dashboardUploadFile }))
    await user.upload(inputs[0], new File(["x"], "root.txt"))
    expect(await screen.findByText("up1.file")).toBeInTheDocument()
    await user.upload(inputs[1], new File(["y"], "in.txt"))
    await waitFor(() => expect(posts).toEqual([null, "f1"]))
  })

  it("drag and drop wiring: OS drop on the page uploads, file drop on folder header moves", async () => {
    const posts: string[] = []
    stubFetch([
      { match: "/api/projects/p1/attachments", method: "POST", respond: () => { posts.push("x"); return jsonResponse(att("dropped")) } },
      { match: /attachments\/a$/, method: "PATCH", respond: () => jsonResponse({}) },
    ])
    renderSection([fold("f1", null, 0)], [att("a")])
    const section = screen.getByRole("heading", { name: ja.dashboardAttachments }).closest("section")!
    const file = new File(["z"], "drop.txt")
    fireEvent.dragOver(section, { dataTransfer: { types: ["Files"], files: [file] } })
    fireEvent.drop(section, { dataTransfer: { types: ["Files"], files: [file], getData: () => "" } })
    expect(await screen.findByText("dropped.file")).toBeInTheDocument()

    const store: Record<string, string> = {}
    const dt = { types: [] as string[], files: [], setData: (k: string, v: string) => { store[k] = v; dt.types.push(k) }, getData: (k: string) => store[k] ?? "" }
    const grip = screen.getByRole("link", { name: "a.file" }).closest("li")!.querySelector("[draggable=true]")!
    fireEvent.dragStart(grip, { dataTransfer: dt })
    const header = screen.getByRole("button", { name: /^Folder f1/ }).parentElement!
    fireEvent.dragOver(header, { dataTransfer: dt, clientY: 50 })
    fireEvent.drop(header, { dataTransfer: dt })
    await waitFor(() => expect(screen.getByRole("button", { name: /Folder f1.*\(1\)/ })).toBeInTheDocument())
  })
})
