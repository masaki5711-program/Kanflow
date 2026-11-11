import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { BoardsContent } from "../boards-content"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: nav.push }) }))

const t = tr("ja")
const URL = "/api/projects/p1/boards"

function summary(id: string, title: string, extra: Record<string, unknown> = {}) {
  return { id, title, sheetCount: 2, createdAt: "2026-11-01T00:00:00.000Z", updatedAt: "2026-11-02T03:04:05.000Z", deletedAt: null, deletedBy: null, ...extra }
}

function list(boards: unknown[], permissions = { canWrite: true, canManage: true }) {
  return jsonResponse({ boards, limit: 200, permissions })
}

/** Body of the first request with this method. */
function bodyOf(fetchMock: ReturnType<typeof stubFetch>, method: string, url?: string): unknown {
  const call = fetchMock.mock.calls.find(([input, init]) => init?.method === method && (url === undefined || String(input) === url))
  return call ? JSON.parse(String(call[1]?.body)) : undefined
}

afterEach(() => {
  vi.unstubAllGlobals()
  nav.push.mockReset()
})

describe("ボード一覧 (plan 10 B1)", () => {
  it("lists the boards with a link to the editor", async () => {
    stubFetch([
      { match: /\?trashed=1$/, respond: () => list([]) },
      { match: URL, method: "GET", respond: () => list([summary("b1", "構成図（合成）"), summary("b2", "業務フロー（合成）")]) },
    ])
    renderWithProviders(<BoardsContent projectId="p1" />)
    const boards = await screen.findByRole("list", { name: t.wbListLabel })
    expect(within(boards).getAllByRole("listitem")).toHaveLength(2)
    expect(within(boards).getByRole("link", { name: "構成図（合成）" })).toHaveAttribute("href", "/projects/p1/boards/b1")
    expect(within(boards).getAllByText(new RegExp(t.wbSheetCount.replace("{count}", "2")))).toHaveLength(2)
    expect(screen.getByRole("button", { name: t.wbNew })).toBeInTheDocument()
  })

  it("an empty project shows the empty state; creating a board posts it and opens the editor", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: /\?trashed=1$/, respond: () => list([]) },
      { match: URL, method: "GET", respond: () => list([]) },
      { match: URL, method: "POST", respond: () => jsonResponse({ id: "b9", title: "新しい図", updatedAt: "2026-11-02T00:00:00.000Z", sheets: [] }, 201) },
    ])
    renderWithProviders(<BoardsContent projectId="p1" />)
    expect(await screen.findByRole("heading", { name: t.wbEmptyTitle })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.wbNew }))
    const dialog = await screen.findByRole("dialog", { name: t.wbCreateTitle })
    // An empty name is refused in the dialog, without a request.
    await user.click(within(dialog).getByRole("button", { name: t.create }))
    expect(within(dialog).getByText(t.wbNameRequired)).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(new RegExp(t.wbNameLabel)), "新しい図")
    await user.click(within(dialog).getByRole("button", { name: t.create }))
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/projects/p1/boards/b9"))
    expect(bodyOf(fetchMock, "POST")).toEqual({ title: "新しい図", sheetName: t.wbDefaultSheetName.replace("{n}", "1") })
  })

  it("a refused create keeps the dialog open and shows the server's message", async () => {
    const user = userEvent.setup()
    stubFetch([
      { match: URL, method: "GET", respond: () => list([], { canWrite: true, canManage: false }) },
      { match: URL, method: "POST", respond: () => jsonResponse({ error: "ボードの数が上限に達しています（合成）" }, 409) },
    ])
    renderWithProviders(<BoardsContent projectId="p1" />)
    await user.click(await screen.findByRole("button", { name: t.wbNew }))
    const dialog = await screen.findByRole("dialog", { name: t.wbCreateTitle })
    await user.type(within(dialog).getByLabelText(new RegExp(t.wbNameLabel)), "図")
    await user.click(within(dialog).getByRole("button", { name: t.create }))
    expect(await within(dialog).findByText("ボードの数が上限に達しています（合成）")).toBeInTheDocument()
    expect(nav.push).not.toHaveBeenCalled()
  })

  it("renames a board from its menu", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: /\?trashed=1$/, respond: () => list([]) },
      { match: URL, method: "GET", respond: () => list([summary("b1", "構成図（合成）")]) },
      { match: `${URL}/b1`, method: "PATCH", respond: () => jsonResponse({ id: "b1", title: "構成図 v2", updatedAt: "2026-11-03T00:00:00.000Z", sheets: [] }) },
    ])
    renderWithProviders(<BoardsContent projectId="p1" />)
    await user.click(await screen.findByRole("button", { name: t.wbActionsFor.replace("{name}", "構成図（合成）") }))
    await user.click(screen.getByRole("menuitem", { name: t.wbRename }))
    const dialog = await screen.findByRole("dialog", { name: t.wbRenameTitle })
    const field = within(dialog).getByLabelText(new RegExp(t.wbNameLabel))
    expect(field).toHaveValue("構成図（合成）")
    await user.clear(field)
    await user.type(field, "構成図 v2")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(bodyOf(fetchMock, "PATCH", `${URL}/b1`)).toEqual({ title: "構成図 v2" }))
    await waitFor(() => expect(screen.queryByRole("dialog", { name: t.wbRenameTitle })).not.toBeInTheDocument())
  })

  it("moves a board to the trash only after the confirmation", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: /\?trashed=1$/, respond: () => list([]) },
      { match: URL, method: "GET", respond: () => list([summary("b1", "構成図（合成）")]) },
      { match: `${URL}/b1`, method: "DELETE", respond: () => jsonResponse({ ok: true }) },
    ])
    renderWithProviders(<BoardsContent projectId="p1" />)
    const menu = await screen.findByRole("button", { name: t.wbActionsFor.replace("{name}", "構成図（合成）") })
    await user.click(menu)
    await user.click(screen.getByRole("menuitem", { name: t.trashMoveToTrash }))
    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText(t.wbDeleteConfirmMessage.replace("{name}", "構成図（合成）"))).toBeInTheDocument()
    await user.click(within(confirm).getByRole("button", { name: t.cancel }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false)

    await user.click(menu)
    await user.click(screen.getByRole("menuitem", { name: t.trashMoveToTrash }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.trashMoveToTrash }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => init?.method === "DELETE" && String(input) === `${URL}/b1`)).toBe(true))
  })

  it("a member without board.manage gets no trash: neither the menu entry nor the trashed list", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([{ match: URL, method: "GET", respond: () => list([summary("b1", "構成図（合成）")], { canWrite: true, canManage: false }) }])
    renderWithProviders(<BoardsContent projectId="p1" />)
    await user.click(await screen.findByRole("button", { name: t.wbActionsFor.replace("{name}", "構成図（合成）") }))
    expect(screen.getByRole("menuitem", { name: t.wbRename })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: t.trashMoveToTrash })).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([input]) => String(input).includes("trashed=1"))).toBe(false)
  })

  it("a reader sees the boards without any action", async () => {
    stubFetch([{ match: URL, method: "GET", respond: () => list([summary("b1", "構成図（合成）")], { canWrite: false, canManage: false }) }])
    renderWithProviders(<BoardsContent projectId="p1" />)
    expect(await screen.findByRole("link", { name: "構成図（合成）" })).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.wbNew })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.wbActionsFor.replace("{name}", "構成図（合成）") })).not.toBeInTheDocument()
  })

  it("PO / SM see the trashed boards and restore one", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      {
        match: /\?trashed=1$/,
        respond: () => list([summary("b7", "古い図（合成）", { deletedAt: "2026-11-05T00:00:00.000Z", deletedBy: { id: "u1", name: "合成 太郎" } })]),
      },
      { match: URL, method: "GET", respond: () => list([summary("b1", "構成図（合成）")]) },
      { match: `${URL}/b7/restore`, method: "POST", respond: () => jsonResponse({ ok: true }) },
    ])
    renderWithProviders(<BoardsContent projectId="p1" />)
    const trash = await screen.findByRole("region", { name: t.wbTrashHeading })
    expect(within(trash).getByText("古い図（合成）")).toBeInTheDocument()
    await user.click(within(trash).getByRole("button", { name: `${t.trashRestore}: 古い図（合成）` }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([input, init]) => init?.method === "POST" && String(input) === `${URL}/b7/restore`)).toBe(true))
  })

  it("a failed load says so and offers a retry", async () => {
    const user = userEvent.setup()
    let fail = true
    stubFetch([{ match: URL, method: "GET", respond: () => (fail ? jsonResponse({ error: "サーバーエラー（合成）" }, 500) : list([summary("b1", "構成図（合成）")])) }])
    renderWithProviders(<BoardsContent projectId="p1" />)
    expect(await screen.findByRole("heading", { name: t.wbLoadFailed })).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole("button", { name: t.errorRetry }))
    expect(await screen.findByRole("link", { name: "構成図（合成）" })).toBeInTheDocument()
  })
})
