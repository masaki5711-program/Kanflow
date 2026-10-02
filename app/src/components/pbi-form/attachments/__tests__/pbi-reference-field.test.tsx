import { useState } from "react"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { createEvent, fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { PbiAttachmentDto } from "@/types/api"
import { PbiReferenceField } from "../pbi-reference-field"
import type { PbiAttachmentsController } from "../types"
import { useSavedPbiAttachments } from "../use-saved-pbi-attachments"

vi.mock("@/lib/image-compress", () => ({ compressImageFile: vi.fn(async (f: File) => f) }))

const t = tr("ja")

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake")
  URL.revokeObjectURL = vi.fn()
})

function controller(over: Partial<PbiAttachmentsController> = {}): PbiAttachmentsController {
  return { items: [], add: vi.fn(), remove: vi.fn(), busy: false, errors: [], clearErrors: vi.fn(), ...over }
}

function renderField(ctl: PbiAttachmentsController, value = "") {
  const onChange = vi.fn()
  renderWithProviders(<PbiReferenceField value={value} onChange={onChange} attachments={ctl} />)
  return { onChange, textarea: screen.getByLabelText(t.backlogReferenceDoc) as HTMLTextAreaElement }
}

function pasteFiles(target: Element, files: File[], text = "") {
  const event = createEvent.paste(target, { clipboardData: { files, getData: () => text } })
  fireEvent(target, event)
  return event
}

describe("PbiReferenceField", () => {
  it("adds a screenshot pasted into the 参考資料 text as an attachment (renamed, default prevented)", () => {
    const ctl = controller()
    const { textarea } = renderField(ctl)
    const shot = new File(["png"], "image.png", { type: "image/png" })
    const event = pasteFiles(textarea, [shot])
    expect(ctl.add).toHaveBeenCalledTimes(1)
    const [added] = vi.mocked(ctl.add).mock.calls[0][0]
    expect(added.name).toMatch(/^screenshot-\d{8}-\d{6}\.png$/)
    expect(event.defaultPrevented).toBe(true)
  })

  it("leaves a plain-text paste to the textarea", () => {
    const ctl = controller()
    const { textarea } = renderField(ctl)
    const event = pasteFiles(textarea, [], "https://example.com/spec")
    expect(ctl.add).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it("adds files dropped on the field and highlights the drop zone while dragging", () => {
    const ctl = controller()
    renderField(ctl)
    const zone = screen.getByRole("button", { name: t.pbiAttachDrop })
    const doc = new File(["%PDF"], "spec.pdf", { type: "application/pdf" })
    fireEvent.dragEnter(zone, { dataTransfer: { types: ["Files"], files: [] } })
    expect(zone.className).toMatch(/border-primary bg-primary-soft\/60/)
    fireEvent.drop(zone, { dataTransfer: { types: ["Files"], files: [doc] } })
    expect(ctl.add).toHaveBeenCalledWith([doc])
    expect(zone.className).not.toMatch(/bg-primary-soft\/60/)
  })

  it("adds files dropped on the textarea too", () => {
    const ctl = controller()
    const { textarea } = renderField(ctl)
    const doc = new File(["x"], "notes.txt", { type: "text/plain" })
    fireEvent.drop(textarea, { dataTransfer: { types: ["Files"], files: [doc] } })
    expect(ctl.add).toHaveBeenCalledWith([doc])
  })

  it("offers the keyboard-usable picker: the button opens the file input, chosen files are added", async () => {
    const ctl = controller()
    const { container } = renderWithProviders(<PbiReferenceField value="" onChange={vi.fn()} attachments={ctl} />)
    const input = container.querySelector('input[type="file"]') as HTMLInputElement
    const click = vi.spyOn(input, "click")
    await userEvent.click(screen.getByRole("button", { name: t.pbiAttachDrop }))
    expect(click).toHaveBeenCalled()
    const doc = new File(["x"], "a.txt", { type: "text/plain" })
    fireEvent.change(input, { target: { files: [doc] } })
    expect(ctl.add).toHaveBeenCalledWith([doc])
  })

  it("ignores pastes and drops when the PBI is at the attachment limit", () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `a${i}`, name: `f${i}.txt`, size: 1, mimeType: "text/plain", url: null, pending: true }))
    const ctl = controller({ items })
    const { textarea } = renderField(ctl)
    pasteFiles(textarea, [new File(["x"], "image.png", { type: "image/png" })])
    const drop = createEvent.drop(textarea, { dataTransfer: { types: ["Files"], files: [new File(["x"], "a.txt")] } })
    fireEvent(textarea, drop)
    expect(ctl.add).not.toHaveBeenCalled()
    // The browser must not open the dropped file in place of the page.
    expect(drop.defaultPrevented).toBe(true)
    expect(screen.getByRole("button", { name: t.pbiAttachDrop })).toBeDisabled()
  })

  it("lists attachments with a labelled remove button and announces errors politely", async () => {
    const ctl = controller({
      items: [{ id: "p1", name: "spec.pdf", size: 2048, mimeType: "application/pdf", url: null, pending: true }],
      errors: ["big.mov: too large"],
    })
    renderField(ctl)
    expect(screen.getByText("spec.pdf")).toBeInTheDocument()
    expect(screen.getByText(new RegExp(t.pbiAttachPendingNote))).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.pbiAttachRemove.replace("{name}", "spec.pdf") }))
    expect(ctl.remove).toHaveBeenCalledWith("p1")
    const message = screen.getByText("big.mov: too large")
    expect(message.closest("[aria-live]")).toHaveAttribute("aria-live", "polite")
    await userEvent.click(screen.getByRole("button", { name: t.pbiAttachClearErrors }))
    expect(ctl.clearErrors).toHaveBeenCalled()
  })

  it("renders only the textarea when no attachment controller is given", () => {
    renderWithProviders(<PbiReferenceField value="" onChange={vi.fn()} />)
    expect(screen.getByLabelText(t.backlogReferenceDoc)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.pbiAttachDrop })).not.toBeInTheDocument()
  })
})

/** The field wired to an existing PBI (uploads at once), like the detail modal's edit mode. */
function SavedHarness({ initial = [] }: { initial?: PbiAttachmentDto[] }) {
  const [attachments, setAttachments] = useState<PbiAttachmentDto[]>(initial)
  const ctl = useSavedPbiAttachments({ projectId: "p1", itemId: "b1", attachments, onChange: (update) => setAttachments((prev) => update(prev)) })
  return <PbiReferenceField value="" onChange={vi.fn()} attachments={ctl} />
}

describe("PbiReferenceField + useSavedPbiAttachments", () => {
  const URL_LIST = "/api/projects/p1/backlog/b1/attachments"

  it("uploads a pasted screenshot at once and shows it as an image thumbnail", async () => {
    const fetchMock = stubFetch([
      {
        match: URL_LIST,
        method: "POST",
        respond: () => jsonResponse({ id: "a1", fileName: "x.png", originalName: "screenshot.png", fileSize: 3, mimeType: "image/png", createdAt: "" }, 201),
      },
    ])
    renderWithProviders(<SavedHarness />)
    pasteFiles(screen.getByLabelText(t.backlogReferenceDoc), [new File(["png"], "image.png", { type: "image/png" })])
    const thumb = await screen.findByRole("button", { name: t.pbiAttachPreview.replace("{name}", "screenshot.png") })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(URL_LIST)
    expect(init.body).toBeInstanceOf(FormData)
    // Decorative thumbnail (alt=""): the button carries the name.
    expect(thumb.querySelector("img")).toHaveAttribute("src", `${URL_LIST}/a1`)
  })

  it("refuses a file over 200 MB without uploading and says why", async () => {
    const fetchMock = stubFetch([])
    renderWithProviders(<SavedHarness />)
    const huge = new File(["x"], "movie.mov", { type: "video/quicktime" })
    Object.defineProperty(huge, "size", { value: 200 * 1024 * 1024 + 1 })
    fireEvent.drop(screen.getByRole("button", { name: t.pbiAttachDrop }), { dataTransfer: { types: ["Files"], files: [huge] } })
    expect(await screen.findByText(`movie.mov: ${t.pbiAttachTooLarge}`)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("shows a per-file error when the server refuses an upload", async () => {
    stubFetch([{ match: URL_LIST, method: "POST", respond: () => jsonResponse({ error: "許可されていないファイル形式です" }, 415) }])
    renderWithProviders(<SavedHarness />)
    fireEvent.drop(screen.getByRole("button", { name: t.pbiAttachDrop }), {
      dataTransfer: { types: ["Files"], files: [new File(["x"], "run.sh", { type: "application/x-sh" })] },
    })
    expect(await screen.findByText(/^run\.sh: /)).toBeInTheDocument()
  })

  it("deletes an attachment after confirmation", async () => {
    const fetchMock = stubFetch([{ match: `${URL_LIST}/a1`, method: "DELETE", respond: () => jsonResponse({ success: true }) }])
    renderWithProviders(
      <SavedHarness initial={[{ id: "a1", fileName: "s.pdf", originalName: "spec.pdf", fileSize: 10, mimeType: "application/pdf", createdAt: "" }]} />,
    )
    expect(screen.getByRole("link", { name: "spec.pdf" })).toHaveAttribute("href", `${URL_LIST}/a1`)
    await userEvent.click(screen.getByRole("button", { name: t.pbiAttachDelete.replace("{name}", "spec.pdf") }))
    await userEvent.click(await screen.findByRole("button", { name: t.delete }))
    await waitFor(() => expect(screen.queryByText("spec.pdf")).not.toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(`${URL_LIST}/a1`, expect.objectContaining({ method: "DELETE" }))
  })
})
