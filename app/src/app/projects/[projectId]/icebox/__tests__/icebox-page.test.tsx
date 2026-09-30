import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, stubFetch, jsonResponse, tr } from "@/app/__tests__/test-utils"
import { getProjectTypeLabels } from "@/lib/project-type-labels"
import { getUiLabels } from "@/components/ui"
import type { Language } from "@/lib/i18n"
import { iceboxLists } from "./fixtures"

const nav = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p1" }),
  useRouter: () => ({ push: nav.push }),
}))
vi.mock("@/components/media-preview-modal", () => ({
  default: ({ items, startIndex, onClose }: { items: { id: string }[]; startIndex: number; onClose: () => void }) => (
    <div data-testid="preview">
      {items.map((i) => i.id).join(",")}@{startIndex}
      <button type="button" onClick={onClose}>close-preview</button>
    </div>
  ),
}))
vi.mock("@/components/pbi-draft-picker-modal", () => ({
  PbiDraftPickerModal: ({ iceboxItemId, onPick, onClose }: { iceboxItemId: string; onPick: (d: object) => void; onClose: () => void }) => (
    <div data-testid="draft-picker">
      {iceboxItemId}
      <button type="button" onClick={() => onPick({ initiative: "Drafted" })}>pick-draft</button>
      <button type="button" onClick={onClose}>close-draft</button>
    </div>
  ),
}))
vi.mock("@/lib/image-compress", () => ({ compressImageFile: async (f: File) => f }))

const { default: IceboxPage } = await import("../page")

const URL_BASE = "/api/projects/p1/icebox"
const t = tr("ja")
const pt = getProjectTypeLabels("software", "ja")
const ui = getUiLabels("ja")

let rectSpy: ReturnType<typeof vi.spyOn> | null = null
beforeAll(() => {
  rectSpy = vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 1, height: 1 }] as unknown as DOMRectList)
})
afterAll(() => rectSpy?.mockRestore())

interface Opts {
  loadStatus?: number
  patchStatus?: number
  deleteStatus?: number
  createStatus?: number
}

function setup(opts: Opts = {}) {
  let loads = 0
  return stubFetch([
    {
      match: URL_BASE,
      method: "GET",
      respond: () => {
        loads++
        return opts.loadStatus && loads === 1 ? jsonResponse({ error: "broken" }, opts.loadStatus) : jsonResponse(iceboxLists())
      },
    },
    { match: URL_BASE, method: "POST", respond: () => jsonResponse({ error: "bad" }, opts.createStatus ?? 201) },
    { match: /\/icebox\/[a-z0-9]+$/, method: "PATCH", respond: () => jsonResponse({ error: "denied" }, opts.patchStatus ?? 200) },
    { match: /\/icebox\/[a-z0-9]+$/, method: "DELETE", respond: () => jsonResponse({ error: "locked" }, opts.deleteStatus ?? 200) },
  ])
}

function renderPage(language: Language = "ja") {
  return renderWithProviders(<IceboxPage />, { language })
}

function section(title: string) {
  return screen.getByRole("heading", { level: 2, name: title }).closest("section") as HTMLElement
}

function bodyOf(fetchMock: ReturnType<typeof stubFetch>, method: string) {
  const call = fetchMock.mock.calls.find(([, i]) => i?.method === method)
  return call ? JSON.parse(String(call[1]?.body)) : undefined
}

describe("IceboxPage", () => {
  beforeEach(() => {
    nav.push.mockReset()
    sessionStorage.clear()
  })

  it("renders a skeleton, then all four status sections with counts", async () => {
    setup()
    renderPage()
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    expect(await screen.findByText("Dark mode please")).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1, name: pt.iceboxTitle })).toBeInTheDocument()
    expect(within(section(t.iceboxStatusCompleted)).getByText(t.iceboxNoItems)).toBeInTheDocument()
    expect(within(section(t.iceboxStatusReviewed)).getByText(/Heard/)).toBeInTheDocument()
    expect(within(section(t.iceboxStatusFrozen)).getByText(/Out of scope/)).toBeInTheDocument()
    // Frozen items cannot generate a PBI draft.
    expect(within(section(t.iceboxStatusFrozen)).queryByRole("button", { name: t.aiGeneratePbiDraft })).not.toBeInTheDocument()
  })

  it("shows an error state and recovers via retry", async () => {
    setup({ loadStatus: 500 })
    renderPage()
    expect(await screen.findByText(t.iceboxLoadFailed)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.backlogRetry }))
    expect(await screen.findByText("Dark mode please")).toBeInTheDocument()
  })

  it("filters items by search query", async () => {
    setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.type(screen.getByRole("searchbox", { name: t.iceboxSearchLabel }), "csv")
    expect(screen.queryByText("Dark mode please")).not.toBeInTheDocument()
    expect(screen.getByText("Export CSV")).toBeInTheDocument()
  })

  it("moves an item to reviewed optimistically", async () => {
    const fetchMock = setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(within(section(t.iceboxStatusUnreviewed)).getByRole("button", { name: t.iceboxMoveToReviewed }))
    await waitFor(() => expect(bodyOf(fetchMock, "PATCH")).toEqual({ status: "reviewed" }))
    // Reviewed items can move to completed.
    expect(within(section(t.iceboxStatusReviewed)).getAllByRole("button", { name: t.iceboxMoveToCompleted }).length).toBeGreaterThan(0)
  })

  it("rolls back a failed status change and shows a toast", async () => {
    setup({ patchStatus: 500 })
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(within(section(t.iceboxStatusFrozen)).getByRole("button", { name: t.iceboxMoveToUnreviewed }))
    expect(await screen.findByText(`${t.iceboxStatusChangeFailed}: denied`)).toBeInTheDocument()
    await waitFor(() => expect(within(section(t.iceboxStatusFrozen)).getByText("Old idea")).toBeInTheDocument())
  })

  it("confirms before deleting; cancel keeps the item", async () => {
    const fetchMock = setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(within(section(t.iceboxStatusUnreviewed)).getByRole("button", { name: t.delete }))
    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.iceboxDeleteConfirm)
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(screen.getByText("Dark mode please")).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false)
  })

  it("deletes after confirming", async () => {
    setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(within(section(t.iceboxStatusUnreviewed)).getByRole("button", { name: t.delete }))
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText(t.iceboxDeleted)).toBeInTheDocument()
    expect(screen.queryByText("Dark mode please")).not.toBeInTheDocument()
  })

  it("restores the item when delete fails", async () => {
    setup({ deleteStatus: 409 })
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(within(section(t.iceboxStatusUnreviewed)).getByRole("button", { name: t.delete }))
    await userEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    expect(await screen.findByText(`${t.iceboxDeleteFailed}: locked`)).toBeInTheDocument()
    expect(await screen.findByText("Dark mode please")).toBeInTheDocument()
  })

  it("opens the media preview for previewable attachments only", async () => {
    setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(screen.getByRole("button", { name: t.iceboxAttachmentPreview.replace("{name}", "voice.mp3") }))
    expect(screen.getByTestId("preview")).toHaveTextContent("img1,vid1,aud1@2")
    await userEvent.click(screen.getByText("close-preview"))
    expect(screen.queryByTestId("preview")).not.toBeInTheDocument()
    // Non-media files are plain download links with a truncated label.
    expect(screen.getByRole("link", { name: /spec\.pdf/ })).toHaveAttribute("href", `${URL_BASE}/u1/attachments/doc1`)
    expect(screen.getByRole("button", { name: t.iceboxAttachmentPreview.replace("{name}", "a-very-long-video-file-name.mp4") })).toHaveTextContent("…")
    await userEvent.click(screen.getByRole("button", { name: t.iceboxAttachmentPreview.replace("{name}", "screen.png") }))
    expect(screen.getByTestId("preview")).toHaveTextContent("@0")
  })

  it("hands a picked PBI draft to the backlog page via sessionStorage", async () => {
    setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(within(section(t.iceboxStatusUnreviewed)).getByRole("button", { name: t.aiGeneratePbiDraft }))
    expect(screen.getByTestId("draft-picker")).toHaveTextContent("u1")
    await userEvent.click(screen.getByText("pick-draft"))
    expect(JSON.parse(sessionStorage.getItem("kanflow:pbiDraft:p1") ?? "{}")).toEqual({ initiative: "Drafted", iceboxItemId: "u1" })
    expect(nav.push).toHaveBeenCalledWith("/projects/p1/backlog?fromAiDraft=1")
    expect(screen.queryByTestId("draft-picker")).not.toBeInTheDocument()
  })

  it("closes the draft picker without navigating", async () => {
    setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await userEvent.click(within(section(t.iceboxStatusReviewed)).getByRole("button", { name: t.aiGeneratePbiDraft }))
    await userEvent.click(screen.getByText("close-draft"))
    expect(nav.push).not.toHaveBeenCalled()
  })

  it("creates a request and asks before discarding a dirty form", async () => {
    const fetchMock = setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("Dark mode please")
    const addButton = screen.getByRole("button", { name: t.iceboxAddRequest })
    await user.click(addButton)
    expect(addButton).toBeDisabled()
    const form = screen.getByRole("region", { name: t.iceboxNewRequest })

    // Clean form cancels immediately.
    await user.click(within(form).getByRole("button", { name: t.cancel }))
    expect(screen.queryByRole("region", { name: t.iceboxNewRequest })).not.toBeInTheDocument()

    await user.click(addButton)
    const form2 = screen.getByRole("region", { name: t.iceboxNewRequest })
    const [author, request] = [within(form2).getByRole("textbox", { name: t.sprintAssignee }), within(form2).getByRole("textbox", { name: new RegExp(pt.iceboxRequest) })]
    await user.type(request, "Need SSO")
    await user.click(within(form2).getByRole("button", { name: t.cancel }))
    await user.click(within(screen.getByRole("alertdialog", { name: ui.unsavedTitle })).getByRole("button", { name: t.cancel }))
    expect(request).toHaveValue("Need SSO")

    await user.type(author, "Ken")
    await user.click(within(form2).getByRole("button", { name: t.add }))
    expect(await screen.findByText(t.iceboxCreated)).toBeInTheDocument()
    expect(bodyOf(fetchMock, "POST")).toEqual({ request: "Need SSO", author: "Ken" })
    await waitFor(() => expect(screen.queryByRole("region", { name: t.iceboxNewRequest })).not.toBeInTheDocument())
  })

  it("keeps the create form open and toasts when creation fails; discard closes it", async () => {
    setup({ createStatus: 400 })
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await user.click(screen.getByRole("button", { name: t.iceboxAddRequest }))
    const form = screen.getByRole("region", { name: t.iceboxNewRequest })
    await user.type(within(form).getByRole("textbox", { name: new RegExp(pt.iceboxRequest) }), "X")
    await user.click(within(form).getByRole("button", { name: t.add }))
    expect(await screen.findByText(`${t.iceboxSaveFailed}: bad`)).toBeInTheDocument()
    await user.click(within(form).getByRole("button", { name: t.cancel }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: ui.discard }))
    await waitFor(() => expect(screen.queryByRole("region", { name: t.iceboxNewRequest })).not.toBeInTheDocument())
  })

  it("opens the edit modal for an item and closes it", async () => {
    setup()
    const user = userEvent.setup()
    renderPage()
    await screen.findByText("Dark mode please")
    await user.click(within(section(t.iceboxStatusReviewed)).getByRole("button", { name: t.edit }))
    const dialog = screen.getByRole("dialog", { name: t.iceboxEditTitle })
    expect(within(dialog).getByText("#2")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: t.iceboxEditTitle })).not.toBeInTheDocument())
  })

  it.each(["en", "id"] as const)("renders localized status sections in %s", async (lang) => {
    setup()
    const tl = tr(lang)
    renderPage(lang)
    expect(await screen.findByRole("heading", { level: 2, name: tl.iceboxStatusUnreviewed })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: tl.iceboxAddRequest })).toBeInTheDocument()
    expect(screen.getByRole("searchbox", { name: tl.iceboxSearchLabel })).toBeInTheDocument()
  })
})
