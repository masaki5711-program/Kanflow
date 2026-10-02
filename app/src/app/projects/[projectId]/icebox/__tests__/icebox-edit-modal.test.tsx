import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, stubFetch, jsonResponse, tr } from "@/app/__tests__/test-utils"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { getUiLabels } from "@/components/ui"
import { IceboxEditModal } from "../icebox-edit-modal"
import { formatFileSize, isPreviewable, matchesQuery, editFormFromItem } from "../types"
import { iceboxItem } from "./fixtures"

const compress = vi.hoisted(() => vi.fn(async (f: File) => f))
vi.mock("@/lib/image-compress", () => ({ compressImageFile: compress }))

const t = tr("ja")
const pt = getProjectTypeLabels("software", "ja")
const ui = getUiLabels("ja")

let rectSpy: ReturnType<typeof vi.spyOn> | null = null
beforeAll(() => {
  rectSpy = vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 1, height: 1 }] as unknown as DOMRectList)
})
afterAll(() => rectSpy?.mockRestore())

const ITEM = iceboxItem("i1", 7, {
  request: "Original request",
  status: "unreviewed",
  attachments: [
    { id: "a1", fileName: "x.png", originalName: "shot.png", fileSize: 1500, mimeType: "image/png" },
    { id: "a2", fileName: "y.pdf", originalName: "doc.pdf", fileSize: 10, mimeType: "application/pdf" },
  ],
})

function renderModal(opts: { patch?: number; upload?: number; del?: number } = {}) {
  const onClose = vi.fn()
  const onChanged = vi.fn()
  const fetchMock = stubFetch([
    { match: "/api/projects/p1/icebox/i1", method: "PATCH", respond: () => jsonResponse({ error: "nope" }, opts.patch ?? 200) },
    {
      match: "/api/projects/p1/icebox/i1/attachments",
      method: "POST",
      respond: () =>
        opts.upload
          ? jsonResponse({ error: "too big" }, opts.upload)
          : jsonResponse({ id: "a3", fileName: "z.txt", originalName: "notes.txt", fileSize: 3000000, mimeType: "text/plain" }),
    },
    { match: /\/attachments\/a\d$/, method: "DELETE", respond: () => jsonResponse({ error: "gone" }, opts.del ?? 200) },
  ])
  renderWithProviders(<IceboxEditModal projectId="p1" item={ITEM} onClose={onClose} onChanged={onChanged} />)
  const dialog = screen.getByRole("dialog", { name: t.iceboxEditTitle })
  return { onClose, onChanged, fetchMock, dialog }
}

function fileInput(dialog: HTMLElement) {
  return dialog.querySelector('input[type="file"]') as HTMLInputElement
}

describe("IceboxEditModal", () => {
  it("sends the item version; a VERSION_CONFLICT toasts the conflict message, reloads the list and closes", async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onChanged = vi.fn()
    const fetchMock = stubFetch([
      {
        match: "/api/projects/p1/icebox/i1",
        method: "PATCH",
        respond: () => jsonResponse({ error: "stale", code: "VERSION_CONFLICT", current: { ...ITEM, version: 6 } }, 409),
      },
    ])
    renderWithProviders(<IceboxEditModal projectId="p1" item={{ ...ITEM, version: 5 }} onClose={onClose} onChanged={onChanged} />)
    const dialog = screen.getByRole("dialog", { name: t.iceboxEditTitle })
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const body = JSON.parse(String(fetchMock.mock.calls.find(([, i]) => i?.method === "PATCH")?.[1]?.body))
    expect(body).toMatchObject({ request: "Original request", version: 5 })
    expect(onChanged).toHaveBeenCalled()
    expect(await screen.findByText(t.apiErrVersionConflict)).toBeInTheDocument()
  })

  it("saves edits, including the freeze reason shown only for frozen status", async () => {
    const user = userEvent.setup()
    const { dialog, fetchMock, onClose, onChanged } = renderModal()
    expect(within(dialog).queryByRole("textbox", { name: t.iceboxFreezeReason })).not.toBeInTheDocument()
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t.iceboxStatus }), "frozen")
    await user.type(within(dialog).getByRole("textbox", { name: t.iceboxFreezeReason }), "Later")
    await user.type(within(dialog).getByRole("textbox", { name: t.iceboxPoReviewMemo }), "ok")
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(onChanged).toHaveBeenCalled()
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body))
    expect(body).toEqual({
      author: "Ann",
      request: "Original request",
      background: null,
      status: "frozen",
      poHearingMemo: null,
      poReviewMemo: "ok",
      freezeReason: "Later",
    })
    expect(await screen.findByText(t.iceboxSaved)).toBeInTheDocument()
  })

  it("toasts and stays open when saving fails", async () => {
    const user = userEvent.setup()
    const { dialog, onClose } = renderModal({ patch: 500 })
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    expect(await screen.findByText(`${t.iceboxSaveFailed}: nope`)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("asks before closing with unsaved edits", async () => {
    const user = userEvent.setup()
    const { dialog, onClose } = renderModal()
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "!")
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    const confirm = screen.getByRole("alertdialog", { name: ui.unsavedTitle })
    await user.click(within(confirm).getByRole("button", { name: ui.discard }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("uploads an attachment and refreshes the list", async () => {
    const { dialog, onChanged } = renderModal()
    const file = new File(["hello"], "notes.txt", { type: "text/plain" })
    fireEvent.change(fileInput(dialog), { target: { files: [file] } })
    expect(await within(dialog).findByText("notes.txt")).toBeInTheDocument()
    expect(within(dialog).getByText("2.9 MB")).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
    expect(within(dialog).getByText(t.iceboxAttachmentHint.replace("{count}", "3"))).toBeInTheDocument()
    expect(compress).not.toHaveBeenCalled()
  })

  it("uploads multiple files chosen at once, sequentially, and keeps any that succeed on a partial failure", async () => {
    let call = 0
    const { dialog, onChanged } = renderModal()
    stubFetch([
      {
        match: "/api/projects/p1/icebox/i1/attachments",
        method: "POST",
        respond: async (_u, init) => {
          call += 1
          const name = ((init!.body as FormData).get("file") as File).name
          if (name === "bad.txt") return jsonResponse({ error: "too big" }, 413)
          return jsonResponse({ id: `new${call}`, fileName: name, originalName: name, fileSize: 1, mimeType: "text/plain" })
        },
      },
    ])
    const files = [new File(["a"], "ok1.txt"), new File(["b"], "bad.txt"), new File(["c"], "ok2.txt")]
    fireEvent.change(fileInput(dialog), { target: { files } })
    expect(await within(dialog).findByText("ok1.txt")).toBeInTheDocument()
    expect(await within(dialog).findByText("ok2.txt")).toBeInTheDocument()
    expect(within(dialog).queryByText("bad.txt")).not.toBeInTheDocument()
    // A single failure shows its own message directly (no "N files failed" template).
    expect(await screen.findByText("too big")).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it("accepts a drag-and-drop of files onto the dropzone", async () => {
    const onChanged = vi.fn()
    stubFetch([
      {
        match: "/api/projects/p1/icebox/i1/attachments",
        method: "POST",
        respond: async (_u, init) => {
          const name = ((init!.body as FormData).get("file") as File).name
          return jsonResponse({ id: "newd", fileName: name, originalName: name, fileSize: 1, mimeType: "text/plain" })
        },
      },
    ])
    renderWithProviders(<IceboxEditModal projectId="p1" item={ITEM} onClose={vi.fn()} onChanged={onChanged} />)
    const dialog = screen.getByRole("dialog", { name: t.iceboxEditTitle })
    const dropzone = within(dialog).getByRole("button", { name: t.iceboxAttachDrop })
    const file = new File(["z"], "dropped.txt", { type: "text/plain" })
    fireEvent.dragEnter(dropzone, { dataTransfer: { types: ["Files"], files: [file] } })
    fireEvent.drop(dropzone, { dataTransfer: { types: ["Files"], files: [file] } })
    expect(await within(dialog).findByText("dropped.txt")).toBeInTheDocument()
    expect(onChanged).toHaveBeenCalled()
  })

  it("rejects a drop beyond the per-item attachment limit with a single toast", async () => {
    const manyAttachments = Array.from({ length: 10 }, (_, i) => ({ id: `x${i}`, fileName: `f${i}`, originalName: `f${i}.txt`, fileSize: 1, mimeType: "text/plain" }))
    const fullItem = { ...ITEM, attachments: manyAttachments }
    renderWithProviders(<IceboxEditModal projectId="p1" item={fullItem} onClose={vi.fn()} onChanged={vi.fn()} />)
    const dialog = screen.getByRole("dialog", { name: t.iceboxEditTitle })
    const dropzone = within(dialog).getByRole("button", { name: t.iceboxAttachDrop })
    expect(dropzone).toBeDisabled()
  })

  it("compresses images and toasts when the upload fails", async () => {
    const { dialog, onChanged } = renderModal({ upload: 413 })
    const img = new File(["x"], "p.png", { type: "image/png" })
    await userEvent.click(within(dialog).getByRole("button", { name: t.iceboxAttachDrop }))
    fireEvent.change(fileInput(dialog), { target: { files: [img] } })
    expect(await screen.findByText("too big")).toBeInTheDocument()
    expect(compress).toHaveBeenCalled()
    expect(onChanged).not.toHaveBeenCalled()
    // Empty selection is ignored.
    fireEvent.change(fileInput(dialog), { target: { files: [] } })
  })

  it("confirms before deleting an attachment", async () => {
    const user = userEvent.setup()
    const { dialog, fetchMock, onChanged } = renderModal()
    const del = within(dialog).getByRole("button", { name: t.iceboxAttachmentDelete.replace("{name}", "shot.png") })
    await user.click(del)
    let confirm = screen.getByRole("alertdialog")
    expect(confirm).toHaveTextContent("shot.png")
    await user.click(within(confirm).getByRole("button", { name: t.cancel }))
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false)

    await user.click(del)
    confirm = screen.getByRole("alertdialog")
    await user.click(within(confirm).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(within(dialog).queryByText("shot.png")).not.toBeInTheDocument())
    expect(onChanged).toHaveBeenCalled()
  })

  it("keeps the attachment and toasts when delete fails", async () => {
    const user = userEvent.setup()
    const { dialog } = renderModal({ del: 500 })
    await user.click(within(dialog).getByRole("button", { name: t.iceboxAttachmentDelete.replace("{name}", "doc.pdf") }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.delete }))
    expect(await screen.findByText("gone")).toBeInTheDocument()
    expect(within(dialog).getByText("doc.pdf")).toBeInTheDocument()
  })
})

describe("icebox type helpers", () => {
  it("formats sizes and detects previewable types", () => {
    expect(formatFileSize(10)).toBe("10 B")
    expect(formatFileSize(2048)).toBe("2.0 KB")
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB")
    expect(isPreviewable("audio/ogg")).toBe(true)
    expect(isPreviewable("application/pdf")).toBe(false)
  })

  it("matches queries across memo fields and ids", () => {
    const item = iceboxItem("x", 99, { poReviewMemo: "Approved", poHearingMemo: "Heard" })
    expect(matchesQuery(item, "")).toBe(true)
    expect(matchesQuery(item, "approved")).toBe(true)
    expect(matchesQuery(item, "heard")).toBe(true)
    expect(matchesQuery(item, "99")).toBe(true)
    expect(matchesQuery(item, "ann")).toBe(true)
    expect(matchesQuery(item, "zzz")).toBe(false)
    expect(editFormFromItem(item)).toMatchObject({ background: "", poReviewMemo: "Approved", freezeReason: "" })
  })
})
