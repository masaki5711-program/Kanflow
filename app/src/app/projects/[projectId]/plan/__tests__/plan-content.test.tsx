import { beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { stubLayout } from "@/components/__tests__/helpers"
import type { Language } from "@/lib/i18n"
import { PlanContent } from "../plan-content"
import type { PlanItem } from "../lib/plan-utils"

stubLayout()

const BASE = "/api/projects/p1/plan"
const d = (m: number, day: number) => new Date(2026, m - 1, day, 12).toISOString()

function mk(p: Partial<PlanItem> & { id: string }): PlanItem {
  return {
    projectId: "p1", parentId: null, name: p.id, description: null,
    plannedStart: d(3, 10), plannedEnd: d(3, 20), actualStart: null, actualEnd: null,
    progressPct: 0, color: null, status: "not_started", sortOrder: 0, isMilestone: false, notes: null,
    ...p,
  }
}

function seed(): PlanItem[] {
  return [
    mk({ id: "A", name: "Alpha", sortOrder: 1, status: "in_progress", progressPct: 40 }),
    mk({ id: "A1", name: "Alpha-1", parentId: "A", sortOrder: 1, actualStart: d(3, 11), actualEnd: d(3, 18) }),
    mk({ id: "A2", name: "Alpha-2", parentId: "A", sortOrder: 2 }),
    mk({ id: "B", name: "Beta", sortOrder: 2, status: "done" }),
    mk({ id: "M", name: "Launch", sortOrder: 3, isMilestone: true, plannedStart: d(4, 1), plannedEnd: d(4, 1) }),
  ]
}

let items: PlanItem[]
let fail: { reorder?: boolean; patch?: boolean; list?: boolean; create?: boolean; del?: boolean }

function server() {
  return stubFetch([
    {
      match: BASE, method: "GET",
      respond: () => (fail.list ? jsonResponse({ error: "list broke" }, 500) : jsonResponse(items)),
    },
    {
      match: BASE, method: "POST",
      respond: (_u, init) => {
        if (fail.create) return jsonResponse({ error: "create broke" }, 500)
        const body = JSON.parse(String(init?.body))
        const created = mk({ id: "NEW", ...body, sortOrder: 99 })
        items = [...items, created]
        return jsonResponse(created, 201)
      },
    },
    {
      match: `${BASE}/reorder`, method: "POST",
      respond: () => (fail.reorder ? jsonResponse({ error: "reorder broke" }, 500) : jsonResponse({ ok: true })),
    },
    {
      match: new RegExp(`^${BASE}/[^/]+$`), method: "PATCH",
      respond: (url, init) => {
        if (fail.patch) return jsonResponse({ error: "patch broke" }, 500)
        const id = url.split("/").pop()!
        const patch = JSON.parse(String(init?.body))
        items = items.map((i) => (i.id === id ? { ...i, ...patch } : i))
        return jsonResponse(items.find((i) => i.id === id))
      },
    },
    {
      match: new RegExp(`^${BASE}/[^/]+$`), method: "DELETE",
      respond: (url) => {
        if (fail.del) return jsonResponse({ error: "delete broke" }, 500)
        const id = url.split("/").pop()!
        items = items.filter((i) => i.id !== id)
        return new Response(null, { status: 204 })
      },
    },
  ])
}

function treeNames() {
  // Name buttons in the tree pane carry title = the item name.
  const list = screen.getByTitle("Alpha").closest("ul") as HTMLElement
  return within(list).getAllByRole("listitem").map((li) => li.querySelector("button[title]")?.getAttribute("title"))
}

async function renderPlan(canEdit = true, language: Language = "en") {
  const fetchMock = server()
  renderWithProviders(<PlanContent projectId="p1" canEdit={canEdit} />, { language })
  return fetchMock
}

function callsTo(fetchMock: ReturnType<typeof stubFetch>, method: string, url: string | RegExp) {
  return fetchMock.mock.calls.filter(([u, init]) => {
    const m = (init?.method ?? "GET").toUpperCase()
    return m === method && (typeof url === "string" ? u === url : url.test(String(u)))
  })
}

const t = tr("en")

describe("PlanContent", () => {
  beforeEach(() => {
    items = seed()
    fail = {}
  })

  it("shows a skeleton while loading, then the tree in sortOrder", async () => {
    await renderPlan()
    expect(screen.getByRole("status", { busy: true })).toHaveTextContent(t.loading)
    await screen.findByTitle("Alpha")
    expect(treeNames()).toEqual(["Alpha", "Alpha-1", "Alpha-2", "Beta", "Launch"])
    expect(screen.getByText("40%")).toBeInTheDocument()
  })

  it("shows an error toast and the empty state when loading fails", async () => {
    fail.list = true
    await renderPlan()
    expect(await screen.findByText("list broke")).toBeInTheDocument()
    expect(screen.getByText(t.planEmpty)).toBeInTheDocument()
  })

  it("empty state: add creates an item and opens it for editing", async () => {
    items = []
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByText(t.planEmpty)
    const addButtons = screen.getAllByRole("button", { name: `+ ${t.planAddItem}` })
    await user.click(addButtons[addButtons.length - 1])
    expect(await screen.findByRole("dialog", { name: t.planEditTitle })).toBeInTheDocument()
    const [, init] = callsTo(fetchMock, "POST", BASE)[0]
    expect(JSON.parse(String(init?.body))).toMatchObject({ name: t.planAddItem, parentId: null, isMilestone: false })
  })

  it("create failure shows a toast and does not open the dialog", async () => {
    fail.create = true
    const user = userEvent.setup()
    await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `+ ${t.planAddItem}` }))
    expect(await screen.findByText("create broke")).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("add milestone posts isMilestone and the milestone name", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: t.planAddMilestone }))
    await screen.findByRole("dialog")
    const body = JSON.parse(String(callsTo(fetchMock, "POST", BASE)[0][1]?.body))
    expect(body).toMatchObject({ isMilestone: true, name: t.planAddMilestone })
  })

  it("add child posts parentId", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `${t.planAddChild}: Beta` }))
    await screen.findByRole("dialog")
    expect(JSON.parse(String(callsTo(fetchMock, "POST", BASE)[0][1]?.body)).parentId).toBe("B")
  })

  it("move down swaps siblings optimistically and posts the reorder", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `${t.planMoveDown}: Alpha-1` }))
    expect(treeNames()).toEqual(["Alpha", "Alpha-2", "Alpha-1", "Beta", "Launch"])
    await waitFor(() => expect(callsTo(fetchMock, "POST", `${BASE}/reorder`)).toHaveLength(1))
    const body = JSON.parse(String(callsTo(fetchMock, "POST", `${BASE}/reorder`)[0][1]?.body))
    expect(body.updates).toEqual([
      { id: "A1", parentId: "A", sortOrder: 2 },
      { id: "A2", parentId: "A", sortOrder: 1 },
    ])
  })

  it("rolls back the reorder and shows a toast when it fails", async () => {
    fail.reorder = true
    const user = userEvent.setup()
    await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `${t.planMoveUp}: Beta` }))
    expect(await screen.findByText("reorder broke")).toBeInTheDocument()
    expect(treeNames()).toEqual(["Alpha", "Alpha-1", "Alpha-2", "Beta", "Launch"])
  })

  it("move up on the first sibling / down on the last is a no-op", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `${t.planMoveUp}: Alpha` }))
    await user.click(screen.getByRole("button", { name: `${t.planMoveDown}: Launch` }))
    expect(callsTo(fetchMock, "POST", `${BASE}/reorder`)).toHaveLength(0)
  })

  it("indent makes the item a child of its previous sibling; outdent moves it up a level", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `${t.planIndent}: Alpha-2` }))
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/A2`)).toHaveLength(1))
    // Inline actions are silent on success (no toast).
    expect(screen.queryByText(t.planSavedJustNow)).not.toBeInTheDocument()
    let patches = callsTo(fetchMock, "PATCH", `${BASE}/A2`)
    expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ parentId: "A1" })

    await user.click(screen.getByRole("button", { name: `${t.planOutdent}: Alpha-1` }))
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/A1`)).toHaveLength(1))
    patches = callsTo(fetchMock, "PATCH", `${BASE}/A1`)
    expect(JSON.parse(String(patches[0][1]?.body))).toEqual({ parentId: null })
  })

  it("indent on first sibling and outdent on a root item do nothing", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    await user.click(screen.getByRole("button", { name: `${t.planIndent}: Alpha` }))
    await user.click(screen.getByRole("button", { name: `${t.planOutdent}: Beta` }))
    expect(fetchMock.mock.calls.filter(([, i]) => i?.method === "PATCH")).toHaveLength(0)
  })

  it("patch failure shows an error toast and refetches", async () => {
    fail.patch = true
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    const before = callsTo(fetchMock, "GET", BASE).length
    await user.click(screen.getByRole("button", { name: `${t.planIndent}: Alpha-2` }))
    expect(await screen.findByText("patch broke")).toBeInTheDocument()
    await waitFor(() => expect(callsTo(fetchMock, "GET", BASE).length).toBeGreaterThan(before))
  })

  it("collapse hides children and expand restores them", async () => {
    const user = userEvent.setup()
    await renderPlan()
    await screen.findByTitle("Alpha")
    const toggle = screen.getByRole("button", { name: `${t.planCollapse}: Alpha` })
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    await user.click(toggle)
    expect(treeNames()).toEqual(["Alpha", "Beta", "Launch"])
    await user.click(screen.getByRole("button", { name: `${t.planExpand}: Alpha` }))
    expect(treeNames()).toHaveLength(5)
  })

  it("opening an item and saving patches it and closes the dialog", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await user.click(await screen.findByTitle("Beta"))
    const dialog = await screen.findByRole("dialog", { name: t.planEditTitle })
    await user.selectOptions(within(dialog).getByLabelText(t.planStatus), "delayed")
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(JSON.parse(String(callsTo(fetchMock, "PATCH", `${BASE}/B`)[0][1]?.body)).status).toBe("delayed")
    // Explicit save keeps its success toast.
    expect(await screen.findByText(t.planSavedJustNow)).toBeInTheDocument()
  })

  it("timeline bars are keyboard operable: arrows move, Enter opens the editor", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    const bar = screen.getByRole("button", { name: /^Beta: / })
    // Roving tabindex: only the first bar is a Tab stop until another is focused.
    expect(bar).toHaveAttribute("tabindex", "-1")
    expect(screen.getByRole("button", { name: /^Alpha: / })).toHaveAttribute("tabindex", "0")
    expect(bar).toHaveAccessibleDescription(t.planBarKeyboardHint)
    bar.focus()
    await waitFor(() => expect(bar).toHaveAttribute("tabindex", "0"))
    expect(screen.getByRole("button", { name: /^Alpha: / })).toHaveAttribute("tabindex", "-1")
    await user.keyboard("{ArrowRight}")
    bar.blur()
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/B`)).toHaveLength(1))
    const body = JSON.parse(String(callsTo(fetchMock, "PATCH", `${BASE}/B`)[0][1]?.body))
    expect(Object.keys(body).sort()).toEqual(["plannedEnd", "plannedStart"])
    expect(screen.queryByText(t.planSavedJustNow)).not.toBeInTheDocument()

    screen.getByRole("button", { name: /^Beta: / }).focus()
    await user.keyboard("{Enter}")
    expect(await screen.findByRole("dialog", { name: t.planEditTitle })).toBeInTheDocument()
  })

  it("timeline bars use a roving tabindex: Up/Down/Home/End move focus between bars", async () => {
    const user = userEvent.setup()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    const bars = () => Array.from(document.querySelectorAll<HTMLElement>("[data-plan-bar]"))
    expect(bars().filter((el) => el.tabIndex === 0)).toHaveLength(1)

    const alpha = screen.getByRole("button", { name: /^Alpha: / })
    act(() => alpha.focus())
    await user.keyboard("{ArrowDown}")
    expect(document.activeElement).toBe(bars()[1])
    expect(bars()[1]).toHaveAttribute("tabindex", "0")
    await user.keyboard("{ArrowUp}")
    expect(document.activeElement).toBe(alpha)
    await user.keyboard("{ArrowUp}")
    expect(document.activeElement).toBe(alpha)
    await user.keyboard("{End}")
    expect(document.activeElement).toBe(bars()[bars().length - 1])
    await user.keyboard("{Home}")
    expect(document.activeElement).toBe(alpha)
    expect(bars().filter((el) => el.tabIndex === 0)).toEqual([alpha])
    // Navigation never edits dates.
    expect(callsTo(fetchMock, "PATCH", `${BASE}/A`)).toHaveLength(0)
  })

  it("deleting from the dialog asks for confirmation and removes the item", async () => {
    const user = userEvent.setup()
    await renderPlan()
    await user.click(await screen.findByTitle("Beta"))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: t.delete }))
    const confirm = await screen.findByRole("alertdialog", { name: t.planConfirmDelete })
    await user.click(within(confirm).getByRole("button", { name: t.delete }))
    expect(await screen.findByText(t.planDeleted)).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTitle("Beta")).not.toBeInTheDocument())
  })

  it("delete failure keeps the dialog and toasts", async () => {
    fail.del = true
    const user = userEvent.setup()
    await renderPlan()
    await user.click(await screen.findByTitle("Beta"))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: t.delete }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    expect(await screen.findByText("delete broke")).toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: t.planEditTitle })).toBeInTheDocument()
  })

  it("read-only users see no add/row actions and a read-only dialog", async () => {
    const user = userEvent.setup()
    await renderPlan(false)
    await screen.findByTitle("Alpha")
    expect(screen.queryByRole("button", { name: `+ ${t.planAddItem}` })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: `${t.planMoveUp}: Alpha` })).not.toBeInTheDocument()
    await user.click(screen.getByTitle("Alpha"))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).queryByRole("button", { name: t.update })).not.toBeInTheDocument()
    expect(within(dialog).queryByRole("button", { name: t.delete })).not.toBeInTheDocument()
  })

  it("zoom switch updates aria-pressed and 'today' jump is harmless", async () => {
    const user = userEvent.setup()
    await renderPlan()
    await screen.findByTitle("Alpha")
    const group = screen.getByRole("group", { name: t.planZoomLabel })
    const day = within(group).getByRole("button", { name: t.planZoomDay })
    expect(within(group).getByRole("button", { name: t.planZoomWeek })).toHaveAttribute("aria-pressed", "true")
    await user.click(day)
    expect(day).toHaveAttribute("aria-pressed", "true")
    await user.click(within(group).getByRole("button", { name: t.planZoomMonth }))
    await user.click(screen.getByRole("button", { name: t.planTodayJump }))
  })

  it("dragging a timeline bar previews locally and persists on release", async () => {
    const proto = HTMLElement.prototype as unknown as Record<string, unknown>
    proto.setPointerCapture = vi.fn()
    proto.hasPointerCapture = vi.fn(() => true)
    proto.releasePointerCapture = vi.fn()
    const fetchMock = await renderPlan()
    await screen.findByTitle("Alpha")
    const bar = screen.getByTitle("Beta (0%)")
    // jsdom's PointerEvent drops clientX; React only needs the event type + coordinates.
    const ptr = (type: string, clientX: number) => fireEvent(bar, new MouseEvent(type, { bubbles: true, clientX }))
    ptr("pointerdown", 100)
    ptr("pointermove", 100 + 14 * 2) // week zoom: 14px/day → +2 days
    ptr("pointerup", 128)
    await waitFor(() => expect(callsTo(fetchMock, "PATCH", `${BASE}/B`)).toHaveLength(1))
    expect(JSON.parse(String(callsTo(fetchMock, "PATCH", `${BASE}/B`)[0][1]?.body))).toEqual({
      plannedStart: "2026-03-12",
      plannedEnd: "2026-03-22",
    })
  })

  it("double-clicking a bar or clicking a milestone opens the dialog", async () => {
    const user = userEvent.setup()
    await renderPlan()
    await screen.findByTitle("Alpha")
    await user.dblClick(screen.getByTitle("Alpha (40%)"))
    expect(await screen.findByRole("dialog")).toBeInTheDocument()
  })

  it("renders the actual-range bar and month header", async () => {
    await renderPlan()
    await screen.findByTitle("Alpha")
    expect(screen.getByTitle(t.planActualRange.replace("{range}", "2026-03-11 ~ 2026-03-18"))).toBeInTheDocument()
    expect(screen.getByText("2026/3")).toBeInTheDocument()
    expect(screen.getByText("2026/4")).toBeInTheDocument()
  })

  it.each(["ja", "id"] as const)("renders toolbar and legend in %s", async (lang) => {
    const tl = tr(lang)
    await renderPlan(true, lang)
    expect(screen.getByRole("heading", { name: tl.planTitle })).toBeInTheDocument()
    expect(screen.getByText(tl.planProgressLegend)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: tl.planTodayJump })).toBeInTheDocument()
    await screen.findByTitle("Alpha")
  })
})
