import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { BoardEditor } from "../board-editor"

const t = tr("ja")
const BOARD_URL = "/api/projects/p1/boards/b1"
const S1 = { id: "s1", name: "全体図", rev: 0 }
const S2 = { id: "s2", name: "詳細", rev: 0 }

type Route = Parameters<typeof stubFetch>[0][number]
interface Write {
  id: string
  version: number
  deleted?: boolean
  data?: { type: string; x?: number; y?: number; w?: number; h?: number; text?: string }
}

function board(sheets = [S1, S2], permissions = { canWrite: true, canManage: false }) {
  return { id: "b1", title: "構成図（合成）", updatedAt: "2026-11-02T00:00:00.000Z", sheets, permissions }
}

function elementsOf(sheetId: string, elements: unknown[] = []): Route {
  return { match: `${BOARD_URL}/sheets/${sheetId}/elements`, method: "GET", respond: () => jsonResponse({ rev: 0, full: true, elements }) }
}

/** Accepts every element write of the sheet. */
function savesOf(sheetId: string): Route {
  return { match: `${BOARD_URL}/sheets/${sheetId}/elements`, method: "POST", respond: () => jsonResponse({ rev: 1, applied: 1, stale: [] }) }
}

function boardRoute(body = board()): Route {
  return { match: BOARD_URL, method: "GET", respond: () => jsonResponse(body) }
}

/** The element writes sent so far, one entry per request. */
function writes(fetchMock: ReturnType<typeof stubFetch>, sheetId = "s1"): Write[][] {
  return fetchMock.mock.calls
    .filter(([input, init]) => init?.method === "POST" && String(input) === `${BOARD_URL}/sheets/${sheetId}/elements`)
    .map(([, init]) => (JSON.parse(String(init?.body)) as { elements: Write[] }).elements)
}

function requests(fetchMock: ReturnType<typeof stubFetch>, method: string, url: string): unknown[] {
  return fetchMock.mock.calls
    .filter(([input, init]) => init?.method === method && String(input) === url)
    .map(([, init]) => (init?.body ? JSON.parse(String(init.body)) : null))
}

async function canvasOf(sheetName: string) {
  return screen.findByRole("application", { name: t.wbCanvasLabel.replace("{sheet}", sheetName) })
}

/** A pointer drag on the canvas (jsdom has no layout: client coordinates are canvas coordinates, zoom 100%). */
function drag(canvas: HTMLElement, from: [number, number], to: [number, number]) {
  fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: from[0], clientY: from[1] })
  fireEvent.pointerMove(canvas, { pointerId: 1, clientX: to[0], clientY: to[1] })
  fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: to[0], clientY: to[1] })
}

function shapes(canvas: HTMLElement, type: string) {
  return canvas.querySelectorAll(`[data-element-type="${type}"]`)
}

async function openSheetMenu(user: ReturnType<typeof userEvent.setup>, sheetName: string, item: string) {
  await user.click(screen.getByRole("button", { name: t.wbActionsFor.replace("{name}", sheetName) }))
  await user.click(screen.getByRole("menuitem", { name: item }))
}

// jsdom has no PointerEvent: without one the events carry neither the button nor the coordinates.
if (typeof window.PointerEvent !== "function") {
  class TestPointerEvent extends MouseEvent {
    readonly pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  Object.defineProperty(window, "PointerEvent", { configurable: true, writable: true, value: TestPointerEvent })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

/** The editor's save state (visible text, plus the regions a screen reader hears). */
const saveRegion = () => document.querySelector("[data-save-status]") as HTMLElement
async function expectSaved() {
  await waitFor(() => expect(saveRegion()).toHaveAttribute("data-save-status", "saved"))
  // "Saved" is announced politely, once the save is done.
  expect(within(saveRegion()).getByRole("status")).toHaveTextContent(t.wbSaveSaved)
}

describe("ボードの編集画面: キャンバス (plan 10 B1)", () => {
  it("draws a rectangle with a drag and saves only that element", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([boardRoute(), elementsOf("s1"), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    expect(screen.getByRole("heading", { level: 1, name: "構成図（合成）" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: t.wbToolRect }))
    expect(screen.getByRole("button", { name: t.wbToolRect })).toHaveAttribute("aria-pressed", "true")
    drag(canvas, [100, 80], [300, 200])

    expect(shapes(canvas, "rect")).toHaveLength(1)
    const rect = shapes(canvas, "rect")[0].querySelector("rect")
    expect([rect?.getAttribute("x"), rect?.getAttribute("y"), rect?.getAttribute("width"), rect?.getAttribute("height")]).toEqual(["100", "80", "200", "120"])
    // The tool goes back to "select" and the new shape is selected.
    expect(screen.getByRole("button", { name: t.wbToolSelect })).toHaveAttribute("aria-pressed", "true")
    expect(canvas.querySelectorAll("[data-selected-id]")).toHaveLength(1)

    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1))
    const [first] = writes(fetchMock)
    expect(first).toHaveLength(1)
    expect(first[0]).toMatchObject({ version: 1, data: { type: "rect", x: 100, y: 80, w: 200, h: 120 } })
    await expectSaved()

    // A second shape: the request carries the new one only.
    await user.click(screen.getByRole("button", { name: t.wbToolEllipse }))
    drag(canvas, [400, 300], [500, 380])
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(2))
    const second = writes(fetchMock)[1]
    expect(second).toHaveLength(1)
    expect(second[0]).toMatchObject({ data: { type: "ellipse" } })
    expect(second[0].id).not.toBe(first[0].id)
  })

  it("selects with a click, deletes with the Delete key and brings the shape back with Ctrl+Z", async () => {
    const stored = { id: "el-stored-1", version: 3, deleted: false, data: { type: "rect", x: 50, y: 50, w: 100, h: 60, z: 1, text: "", fill: "white", stroke: "ink" } }
    const fetchMock = stubFetch([boardRoute(), elementsOf("s1", [stored]), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    expect(shapes(canvas, "rect")).toHaveLength(1)
    expect(screen.getByRole("button", { name: t.wbDeleteSelection })).toBeDisabled()

    // A click on the shape selects it (and gives the canvas the keyboard).
    drag(canvas, [100, 80], [100, 80])
    expect(canvas.querySelector('[data-selected-id="el-stored-1"]')).not.toBeNull()
    expect(canvas).toHaveFocus()
    expect(screen.getByRole("button", { name: t.wbDeleteSelection })).toBeEnabled()
    expect(writes(fetchMock)).toHaveLength(0)

    fireEvent.keyDown(canvas, { key: "Delete" })
    expect(shapes(canvas, "rect")).toHaveLength(0)
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1))
    expect(writes(fetchMock)[0]).toEqual([{ id: "el-stored-1", version: 4, deleted: true }])

    fireEvent.keyDown(canvas, { key: "z", ctrlKey: true })
    expect(shapes(canvas, "rect")).toHaveLength(1)
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(2))
    expect(writes(fetchMock)[1][0]).toMatchObject({ id: "el-stored-1", version: 5, data: { type: "rect", x: 50 } })

    fireEvent.keyDown(canvas, { key: "y", ctrlKey: true })
    expect(shapes(canvas, "rect")).toHaveLength(0)
  })

  it("moves a shape by dragging it and by the arrow keys", async () => {
    const stored = { id: "el-stored-1", version: 1, deleted: false, data: { type: "rect", x: 50, y: 50, w: 100, h: 60, z: 1, text: "", fill: "white", stroke: "ink" } }
    const fetchMock = stubFetch([boardRoute(), elementsOf("s1", [stored]), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")

    drag(canvas, [100, 80], [140, 110])
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(1))
    expect(writes(fetchMock)[0][0]).toMatchObject({ id: "el-stored-1", data: { x: 90, y: 80 } })

    fireEvent.keyDown(canvas, { key: "ArrowRight", shiftKey: true })
    fireEvent.keyDown(canvas, { key: "ArrowDown" })
    await waitFor(() => expect(writes(fetchMock)).toHaveLength(2))
    expect(writes(fetchMock)[1][0]).toMatchObject({ id: "el-stored-1", data: { x: 100, y: 81 } })
  })

  it("a sticky note opens for typing; the text is saved when the edit ends", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([boardRoute(), elementsOf("s1"), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")

    // Keyboard drawing: tool, then Enter on the canvas puts the shape in the middle.
    await user.click(screen.getByRole("button", { name: t.wbToolSticky }))
    canvas.focus()
    await user.keyboard("{Enter}")
    const field = await screen.findByRole("textbox", { name: t.wbTextEditLabel })
    await waitFor(() => expect(field).toHaveFocus())
    await user.type(field, "合成メモ")
    await user.keyboard("{Escape}")
    expect(screen.queryByRole("textbox", { name: t.wbTextEditLabel })).not.toBeInTheDocument()
    expect(canvas).toHaveFocus()
    expect(within(canvas).getByText("合成メモ")).toBeInTheDocument()

    await waitFor(() => expect(writes(fetchMock).flat().some((write) => write.data?.text === "合成メモ")).toBe(true))
    const ids = new Set(writes(fetchMock).flat().map((write) => write.id))
    expect(ids.size).toBe(1)
  })

  it("a failed save is shown and can be retried; nothing is dropped", async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = stubFetch([
      boardRoute(),
      elementsOf("s1"),
      {
        match: `${BOARD_URL}/sheets/s1/elements`,
        method: "POST",
        respond: () => (fail ? jsonResponse({ error: "サーバーエラー（合成）" }, 500) : jsonResponse({ rev: 1, applied: 1, stale: [] })),
      },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    await user.click(screen.getByRole("button", { name: t.wbToolRect }))
    drag(canvas, [100, 80], [300, 200])

    expect(await screen.findByText(t.wbSaveFailed)).toBeInTheDocument()
    expect(screen.getByText(new RegExp(t.wbSaveFailedHint))).toBeInTheDocument()
    expect(shapes(canvas, "rect")).toHaveLength(1)
    const failedWrite = writes(fetchMock)[0]

    fail = false
    await user.click(screen.getByRole("button", { name: t.wbSaveRetry }))
    await expectSaved()
    expect(screen.queryByRole("button", { name: t.wbSaveRetry })).not.toBeInTheDocument()
    // The retry sends the same element again.
    expect(writes(fetchMock).at(-1)?.[0].id).toBe(failedWrite[0].id)
  })

  it("a refused save shows the server's reason", async () => {
    const user = userEvent.setup()
    stubFetch([
      boardRoute(),
      elementsOf("s1"),
      { match: `${BOARD_URL}/sheets/s1/elements`, method: "POST", respond: () => jsonResponse({ error: "シートの図形数が上限です（合成）" }, 409) },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    await user.click(screen.getByRole("button", { name: t.wbToolRect }))
    drag(canvas, [100, 80], [300, 200])
    expect(await screen.findByText(t.wbSaveFailed)).toBeInTheDocument()
    // Read out at once (role=alert), with the server's reason.
    expect(within(saveRegion()).getByRole("alert")).toHaveTextContent(/シートの図形数が上限です（合成）/)
    expect(screen.queryByText(new RegExp(t.wbSaveFailedHint))).not.toBeInTheDocument()
  })

  it("read only: no drawing tools, no save state, the keyboard changes nothing", async () => {
    const stored = { id: "el-stored-1", version: 1, deleted: false, data: { type: "rect", x: 50, y: 50, w: 100, h: 60, z: 1, text: "", fill: "white", stroke: "ink" } }
    const fetchMock = stubFetch([boardRoute(board([S1, S2], { canWrite: false, canManage: false })), elementsOf("s1", [stored])])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    expect(screen.getByText(t.wbReadOnly)).toBeInTheDocument()
    const toolbar = screen.getByRole("toolbar", { name: t.wbToolbarLabel })
    expect(within(toolbar).queryByRole("button", { name: t.wbToolRect })).not.toBeInTheDocument()
    expect(within(toolbar).getByRole("button", { name: t.wbZoomIn })).toBeInTheDocument()
    expect(screen.queryByText(t.wbSaveSaved)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.wbSheetAdd })).not.toBeInTheDocument()

    canvas.focus()
    fireEvent.keyDown(canvas, { key: "a", ctrlKey: true })
    fireEvent.keyDown(canvas, { key: "Delete" })
    drag(canvas, [100, 80], [200, 200])
    expect(shapes(canvas, "rect")).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
  })

  it("the toolbar is one tab stop with arrow-key navigation, and zooms the view", async () => {
    const user = userEvent.setup()
    stubFetch([boardRoute(), elementsOf("s1"), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    const toolbar = screen.getByRole("toolbar", { name: t.wbToolbarLabel })
    const buttons = within(toolbar).getAllByRole("button")
    expect(buttons.filter((button) => button.tabIndex === 0)).toHaveLength(1)
    const select = within(toolbar).getByRole("button", { name: t.wbToolSelect })
    select.focus()
    await user.keyboard("{ArrowRight}")
    expect(within(toolbar).getByRole("button", { name: t.wbToolRect })).toHaveFocus()
    await user.keyboard("{End}")
    expect(within(toolbar).getByRole("button", { name: t.wbZoomFit })).toHaveFocus()
    expect(within(toolbar).getAllByRole("button").filter((button) => button.tabIndex === 0)).toHaveLength(1)

    expect(within(toolbar).getByRole("button", { name: t.wbZoomReset.replace("{percent}", "100") })).toBeInTheDocument()
    await user.click(within(toolbar).getByRole("button", { name: t.wbZoomIn }))
    expect(within(toolbar).queryByRole("button", { name: t.wbZoomReset.replace("{percent}", "100") })).not.toBeInTheDocument()
  })
})

describe("ホワイトボード: without pictures and with the keyboard (B1 review)", () => {
  const stored = [
    { id: "box-aaaa1", version: 1, data: { type: "sticky", x: 0, y: 0, w: 100, h: 80, z: 1, text: "議題（合成）", fill: "amber", stroke: "ink" } },
    { id: "box-bbbb2", version: 1, data: { type: "rect", x: 300, y: 0, w: 100, h: 80, z: 2, text: "", fill: "white", stroke: "ink" } },
    {
      id: "line-ccc3",
      version: 1,
      data: { type: "arrow", z: 3, stroke: "ink", start: { x: 100, y: 40, attach: "box-aaaa1" }, end: { x: 300, y: 40, attach: "box-bbbb2" } },
    },
  ]

  it("lists the sheet's contents in words, outside the canvas (a line names the boxes it connects)", async () => {
    stubFetch([boardRoute(), elementsOf("s1", stored), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    const list = screen.getByTestId("board-contents")
    expect(within(list).getByRole("heading", { name: t.wbSheetContents.replace("{count}", "3") })).toBeInTheDocument()
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent)).toEqual([
      `${t.wbToolSticky}: 議題（合成）`,
      `${t.wbToolRect} (${t.wbNoText})`,
      t.wbLineBetween.replace("{kind}", t.wbToolArrow).replace("{from}", "議題（合成）").replace("{to}", t.wbToolRect),
    ])
    expect(list.closest("[role=application]")).toBeNull()
  })

  it("] and [ select the shapes one by one and say which one it is", async () => {
    stubFetch([boardRoute(), elementsOf("s1", stored), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    canvas.focus()
    fireEvent.keyDown(canvas, { key: "]" })
    expect(canvas.querySelector("[data-selected-id]")?.getAttribute("data-selected-id")).toBe("box-aaaa1")
    expect(within(canvas).getByRole("status")).toHaveTextContent(
      t.wbSelectedOne.replace("{kind}", t.wbToolSticky).replace("{text}", "議題（合成）").replace("{n}", "1").replace("{total}", "3"),
    )
    fireEvent.keyDown(canvas, { key: "]" })
    expect(within(canvas).getByRole("status")).toHaveTextContent(t.wbSelectedOneNoText.replace("{kind}", t.wbToolRect).replace("{n}", "2").replace("{total}", "3"))
    fireEvent.keyDown(canvas, { key: "[" })
    fireEvent.keyDown(canvas, { key: "[" })
    // Wraps around to the last one.
    expect(within(canvas).getByRole("status")).toHaveTextContent(t.wbSelectedOneNoText.replace("{kind}", t.wbToolArrow).replace("{n}", "3").replace("{total}", "3"))
  })

  it("a second pointer does not end the first one's drag", async () => {
    stubFetch([boardRoute(), elementsOf("s1"), savesOf("s1")])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    fireEvent.click(screen.getByRole("button", { name: t.wbToolRect }))
    fireEvent.pointerDown(canvas, { button: 0, pointerId: 1, clientX: 100, clientY: 80 })
    fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 300, clientY: 200 })
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 2, clientX: 120, clientY: 90 })
    // Still drawing: only the preview (ghost) is there, nothing was placed.
    const placed = () => canvas.querySelectorAll('[data-element-type="rect"]:not([data-element-id="ghost-element"])')
    expect(placed()).toHaveLength(0)
    expect(canvas.querySelector('[data-element-id="ghost-element"]')).not.toBeNull()
    fireEvent.pointerUp(canvas, { button: 0, pointerId: 1, clientX: 300, clientY: 200 })
    expect(placed()).toHaveLength(1)
  })
})

describe("ボードの編集画面: シート (plan 10 B1)", () => {
  it("switches the sheet from the tabs", async () => {
    const user = userEvent.setup()
    const stored = { id: "el-on-s2", version: 1, deleted: false, data: { type: "ellipse", x: 0, y: 0, w: 80, h: 80, z: 1, text: "", fill: "white", stroke: "ink" } }
    stubFetch([boardRoute(), elementsOf("s1"), elementsOf("s2", [stored])])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    await user.click(screen.getByRole("tab", { name: "詳細" }))
    const canvas = await canvasOf("詳細")
    expect(shapes(canvas, "ellipse")).toHaveLength(1)
    expect(screen.getByRole("tab", { name: "詳細" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", screen.getByRole("tab", { name: "詳細" }).id)
  })

  it("adds a sheet with the next free name and opens it", async () => {
    const user = userEvent.setup()
    const s3 = { id: "s3", name: t.wbDefaultSheetName.replace("{n}", "3"), rev: 0 }
    const fetchMock = stubFetch([
      boardRoute(),
      elementsOf("s1"),
      elementsOf("s3"),
      { match: `${BOARD_URL}/sheets`, method: "POST", respond: () => jsonResponse({ board: board([S1, S2, s3]), sheetId: "s3" }, 201) },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    await user.click(screen.getByRole("button", { name: t.wbSheetAdd }))
    await canvasOf(s3.name)
    expect(requests(fetchMock, "POST", `${BOARD_URL}/sheets`)).toEqual([{ name: s3.name }])
    expect(screen.getByRole("tab", { name: s3.name })).toHaveAttribute("aria-selected", "true")
  })

  it("renames the open sheet", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      boardRoute(),
      elementsOf("s1"),
      { match: `${BOARD_URL}/sheets/s1`, method: "PATCH", respond: () => jsonResponse(board([{ ...S1, name: "全体図 v2" }, S2])) },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    await openSheetMenu(user, "全体図", t.wbRename)
    const dialog = await screen.findByRole("dialog", { name: t.wbSheetRenameTitle })
    const field = within(dialog).getByLabelText(new RegExp(t.wbSheetNameLabel))
    await user.clear(field)
    await user.type(field, "全体図 v2")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    expect(await screen.findByRole("tab", { name: "全体図 v2" })).toBeInTheDocument()
    expect(requests(fetchMock, "PATCH", `${BOARD_URL}/sheets/s1`)).toEqual([{ name: "全体図 v2" }])
  })

  it("moves the open sheet to the right", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      boardRoute(),
      elementsOf("s1"),
      { match: `${BOARD_URL}/sheets/order`, method: "PUT", respond: () => jsonResponse(board([S2, S1])) },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    await openSheetMenu(user, "全体図", t.wbSheetMoveRight)
    await waitFor(() => expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["詳細", "全体図"]))
    expect(requests(fetchMock, "PUT", `${BOARD_URL}/sheets/order`)).toEqual([{ sheetIds: ["s2", "s1"] }])
    // The same sheet stays open.
    expect(screen.getByRole("tab", { name: "全体図" })).toHaveAttribute("aria-selected", "true")
  })

  it("duplicates the open sheet under a new name and opens the copy", async () => {
    const user = userEvent.setup()
    const copyName = t.wbSheetCopyName.replace("{name}", "全体図")
    const copy = { id: "s9", name: copyName, rev: 0 }
    const fetchMock = stubFetch([
      boardRoute(),
      elementsOf("s1"),
      elementsOf("s9"),
      { match: `${BOARD_URL}/sheets/s1/duplicate`, method: "POST", respond: () => jsonResponse({ board: board([S1, copy, S2]), sheetId: "s9" }, 201) },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    await openSheetMenu(user, "全体図", t.wbSheetDuplicate)
    const dialog = await screen.findByRole("dialog", { name: t.wbSheetDuplicateTitle })
    expect(within(dialog).getByLabelText(new RegExp(t.wbSheetNameLabel))).toHaveValue(copyName)
    await user.click(within(dialog).getByRole("button", { name: t.create }))
    await canvasOf(copyName)
    expect(requests(fetchMock, "POST", `${BOARD_URL}/sheets/s1/duplicate`)).toEqual([{ name: copyName }])
  })

  it("deletes the open sheet after the confirmation and opens its neighbour", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      boardRoute(),
      elementsOf("s1"),
      elementsOf("s2"),
      { match: `${BOARD_URL}/sheets/s1`, method: "DELETE", respond: () => jsonResponse(board([S2])) },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    await canvasOf("全体図")
    await openSheetMenu(user, "全体図", t.wbSheetDelete)
    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText(t.wbSheetDeleteConfirmMessage.replace("{name}", "全体図"))).toBeInTheDocument()
    expect(requests(fetchMock, "DELETE", `${BOARD_URL}/sheets/s1`)).toHaveLength(0)
    await user.click(within(confirm).getByRole("button", { name: t.delete }))
    await canvasOf("詳細")
    expect(screen.getAllByRole("tab").map((tab) => tab.textContent)).toEqual(["詳細"])
  })

  it("a sheet whose save keeps failing is not left without asking", async () => {
    const user = userEvent.setup()
    stubFetch([
      boardRoute(),
      elementsOf("s1"),
      elementsOf("s2"),
      { match: `${BOARD_URL}/sheets/s1/elements`, method: "POST", respond: () => jsonResponse({ error: "サーバーエラー（合成）" }, 500) },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    const canvas = await canvasOf("全体図")
    await user.click(screen.getByRole("button", { name: t.wbToolRect }))
    drag(canvas, [100, 80], [300, 200])

    await user.click(screen.getByRole("tab", { name: "詳細" }))
    const confirm = await screen.findByRole("alertdialog")
    expect(within(confirm).getByText(t.wbSheetUnsavedMessage)).toBeInTheDocument()
    await user.click(within(confirm).getByRole("button", { name: t.cancel }))
    expect(screen.getByRole("tab", { name: "全体図" })).toHaveAttribute("aria-selected", "true")
    expect(shapes(await canvasOf("全体図"), "rect")).toHaveLength(1)

    await user.click(screen.getByRole("tab", { name: "詳細" }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.wbSheetUnsavedLeave }))
    await canvasOf("詳細")
  })

  it("an unknown board says so and links back to the list", async () => {
    stubFetch([{ match: BOARD_URL, method: "GET", respond: () => jsonResponse({ error: "見つかりません（合成）" }, 404) }])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    expect(await screen.findByRole("heading", { name: t.wbNotFoundTitle })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: t.wbBackToList })).toHaveAttribute("href", "/projects/p1/boards")
  })

  it("a sheet that cannot be loaded says so and offers a retry", async () => {
    const user = userEvent.setup()
    let fail = true
    stubFetch([
      boardRoute(),
      {
        match: `${BOARD_URL}/sheets/s1/elements`,
        method: "GET",
        respond: () => (fail ? jsonResponse({ error: "サーバーエラー（合成）" }, 500) : jsonResponse({ rev: 0, full: true, elements: [] })),
      },
    ])
    renderWithProviders(<BoardEditor projectId="p1" boardId="b1" />)
    expect(await screen.findByRole("heading", { name: t.wbSheetLoadFailed })).toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole("button", { name: t.errorRetry }))
    await canvasOf("全体図")
  })
})
