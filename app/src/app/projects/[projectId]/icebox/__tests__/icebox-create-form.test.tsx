import { beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { getUiLabels } from "@/components/ui"
import { IceboxCreateForm } from "../icebox-create-form"

const compress = vi.hoisted(() => vi.fn(async (f: File) => f))
vi.mock("@/lib/image-compress", () => ({ compressImageFile: compress }))

const t = tr("ja")
const pt = getProjectTypeLabels("software", "ja")
const ui = getUiLabels("ja")

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake")
  URL.revokeObjectURL = vi.fn()
})

function renderForm() {
  const onCreated = vi.fn()
  const onClose = vi.fn()
  renderWithProviders(<IceboxCreateForm projectId="p1" onCreated={onCreated} onClose={onClose} />)
  return { onCreated, onClose }
}

function fileInput() {
  return document.querySelector('input[type="file"]') as HTMLInputElement
}

describe("IceboxCreateForm", () => {
  it("creates the item, then uploads chosen files against the new item id", async () => {
    const user = userEvent.setup()
    const created: Record<string, unknown>[] = []
    const uploaded: string[] = []
    stubFetch([
      { match: "/api/projects/p1/icebox", method: "POST", respond: async (_u, init) => {
        created.push(JSON.parse(init!.body as string))
        return jsonResponse({ id: "new-item" }, 201)
      } },
      { match: "/api/projects/p1/icebox/new-item/attachments", method: "POST", respond: async (_u, init) => {
        uploaded.push(((init!.body as FormData).get("file") as File).name)
        return jsonResponse({ id: "a1", fileName: "f", originalName: "f", fileSize: 1, mimeType: "text/plain" })
      } },
    ])
    const { onCreated, onClose } = renderForm()
    await user.type(screen.getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "Please add dark mode")
    const input = fileInput()
    fireEvent.change(input, { target: { files: [new File(["x"], "a.txt")] } })
    await screen.findByText("a.txt")
    await user.click(screen.getByRole("button", { name: t.add }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(onClose).toHaveBeenCalled()
    expect(created[0]).toMatchObject({ request: "Please add dark mode" })
    expect(uploaded).toEqual(["a.txt"])
  })

  it("does not call the attachments endpoint when no files were chosen", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([{ match: "/api/projects/p1/icebox", method: "POST", respond: () => jsonResponse({ id: "new-item" }, 201) }])
    const { onCreated } = renderForm()
    await user.type(screen.getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "No attachments here")
    await user.click(screen.getByRole("button", { name: t.add }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("toasts a partial-upload failure but still reports the item created", async () => {
    const user = userEvent.setup()
    stubFetch([
      { match: "/api/projects/p1/icebox", method: "POST", respond: () => jsonResponse({ id: "new-item" }, 201) },
      { match: "/api/projects/p1/icebox/new-item/attachments", method: "POST", respond: () => jsonResponse({ error: "too big" }, 413) },
    ])
    const { onCreated } = renderForm()
    await user.type(screen.getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "Request with a bad file")
    const input = fileInput()
    fireEvent.change(input, { target: { files: [new File(["x"], "bad.txt")] } })
    await screen.findByText("bad.txt")
    await user.click(screen.getByRole("button", { name: t.add }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(await screen.findByText(t.iceboxAttachPartialFailed.replace("{n}", "1").replace("{names}", "bad.txt"))).toBeInTheDocument()
  })

  it("shows the uploading-N label while files are being sent after creation", async () => {
    const user = userEvent.setup()
    let resolveCreate!: (v: Response) => void
    stubFetch([
      { match: "/api/projects/p1/icebox", method: "POST", respond: () => new Promise((resolve) => { resolveCreate = resolve }) },
    ])
    renderForm()
    await user.type(screen.getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "Pending request")
    const input = fileInput()
    fireEvent.change(input, { target: { files: [new File(["x"], "a.txt")] } })
    await screen.findByText("a.txt")
    await user.click(screen.getByRole("button", { name: t.add }))
    expect(await screen.findByText(t.iceboxAttachUploadingN.replace("{n}", "1"))).toBeInTheDocument()
    resolveCreate(jsonResponse({ id: "new-item" }, 201))
  })

  it("toasts and stays open when the create request itself fails", async () => {
    const user = userEvent.setup()
    stubFetch([{ match: "/api/projects/p1/icebox", method: "POST", respond: () => jsonResponse({ error: "nope" }, 500) }])
    const { onClose } = renderForm()
    await user.type(screen.getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "Will fail")
    await user.click(screen.getByRole("button", { name: t.add }))
    expect(await screen.findByText(`${t.iceboxSaveFailed}: nope`)).toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
  })

  it("asks for confirmation before cancelling with unsaved input", async () => {
    const user = userEvent.setup()
    const { onClose } = renderForm()
    await user.type(screen.getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "x")
    await user.click(screen.getByRole("button", { name: t.cancel }))
    const dialog = screen.getByRole("alertdialog")
    await user.click(within(dialog).getByRole("button", { name: ui.discard }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })

  it("adds a pasted screenshot as an attachment", async () => {
    stubFetch([])
    renderForm()
    const textarea = screen.getByRole("textbox", { name: new RegExp(pt.iceboxRequest) })
    const img = new File(["x"], "image.png", { type: "image/png" })
    fireEvent.paste(textarea, { clipboardData: { files: [img] } })
    expect(await screen.findByText(/^screenshot-\d{8}-\d{6}\.png$/)).toBeInTheDocument()
  })
})
