import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders, stubFetch } from "./__tests__/render"
import { fmt } from "./calendar-types"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p1" }),
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}))

const { default: CalendarPage } = await import("./page")
const t = getTranslations("ja")

/** The live period label ("2026年9月") above the grid — the mini calendar also has h2s. */
function periodHeading(): HTMLElement {
  const found = screen.getAllByRole("heading", { level: 2 }).find((h) => h.getAttribute("aria-live") === "polite")
  if (!found) throw new Error("period heading not found")
  return found
}

const events = [
  { id: "e1", title: "Planning", description: null, date: "2026-09-10T00:00:00.000Z", endDate: null, color: "blue", sprintId: null, sprint: null },
  ...[2, 3, 4, 5].map((n) => ({
    id: `e${n}`, title: `Busy ${n}`, description: null, date: "2026-09-22", endDate: null, color: "green", sprintId: null, sprint: null,
  })),
  { id: "e6", title: "Offsite", description: "Long trip", date: "2026-09-17T10:00", endDate: "2026-09-18T13:30", color: "purple", sprintId: null, sprint: null },
]
const sprints = [
  {
    id: "s1", sprintName: "Sprint A", startDate: "2026-09-07T00:00:00Z", endDate: "2026-09-18T00:00:00Z", status: "active",
    items: [
      { id: "i1", status: "done", pbItem: { id: "pb1", displayId: 7, initiative: null, epic: null, userStory: "Login page", workloadScore: 1 } },
      { id: "i2", status: "in_progress", pbItem: { id: "pb2", displayId: null, initiative: null, epic: null, userStory: "Logout", workloadScore: 1 } },
    ],
  },
  { id: "s2", sprintName: "Sprint B", startDate: "2026-09-28", endDate: "2026-10-09", status: "planning", items: [] },
]
const members = [
  { id: "m1", role: "po", user: { id: "u1", name: "Taro Yamada", email: "taro@x.jp" } },
  { id: "m2", role: "guest", user: { id: "u2", name: null, email: "dev@x.jp" } },
]

type Handler = (url: string, init?: RequestInit) => Response | undefined
let extra: Handler = () => undefined
let fetchMock: ReturnType<typeof stubFetch>

const addLabel = (y: number, m: number, d: number) =>
  fmt(t.calendarAddOnDate, {
    date: new Date(y, m, d).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }),
  })

const methodOf = (c: unknown[]) => (c[1] as RequestInit | undefined)?.method
const bodyOf = (c: unknown[]) => JSON.parse((c[1] as RequestInit).body as string)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] })
  vi.setSystemTime(new Date(2026, 8, 16, 10, 0))
  push.mockReset()
  extra = () => undefined
  fetchMock = stubFetch((url, init) => {
    const custom = extra(url, init)
    if (custom) return custom
    const method = init?.method ?? "GET"
    if (method === "GET" && url.endsWith("/events")) return jsonResponse(events)
    if (url.endsWith("/sprints")) return jsonResponse(sprints)
    if (url.endsWith("/members")) return jsonResponse(members)
    return undefined
  })
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function renderPage() {
  renderWithProviders(<CalendarPage />)
  expect(screen.getByRole("status", { name: t.loading })).toBeInTheDocument()
  await screen.findByRole("button", { name: addLabel(2026, 8, 10) })
}

describe("CalendarPage", () => {
  it("opens the create dialog prefilled with the date from the keyboard-accessible day button", async () => {
    await renderPage()
    const dayBtn = screen.getByRole("button", { name: addLabel(2026, 8, 10) })
    dayBtn.focus()
    await userEvent.keyboard("{Enter}")
    const dialog = await screen.findByRole("dialog", { name: t.eventAdd })
    expect(within(dialog).getAllByDisplayValue("2026-09-10")).toHaveLength(1)
  })

  it("keeps the dialog open and shows an error toast when saving fails", async () => {
    extra = (_url, init) => (init?.method === "POST" ? jsonResponse({ error: "boom" }, 500) : undefined)
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: t.eventAdd }))
    const dialog = await screen.findByRole("dialog", { name: t.eventAdd })
    expect(within(dialog).getByDisplayValue("2026-09-16")).toBeInTheDocument()
    await userEvent.type(within(dialog).getByPlaceholderText(t.eventTitlePlaceholder), "Retro")
    await userEvent.click(within(dialog).getByRole("button", { name: t.add }))
    expect(await screen.findByText(t.calendarSaveFailed)).toBeInTheDocument()
    expect(screen.getByRole("dialog", { name: t.eventAdd })).toBeInTheDocument()
    expect(screen.getByDisplayValue("Retro")).toBeInTheDocument()
  })

  it("posts a new event, closes the dialog and refetches", async () => {
    extra = (_url, init) => (init?.method === "POST" ? jsonResponse({ id: "new" }, 201) : undefined)
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: addLabel(2026, 8, 3) }))
    const dialog = await screen.findByRole("dialog")
    await userEvent.type(within(dialog).getByPlaceholderText(t.eventTitlePlaceholder), "  Demo  ")
    await userEvent.click(within(dialog).getByRole("button", { name: t.add }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    const post = fetchMock.mock.calls.find((c) => methodOf(c) === "POST")!
    expect(post[0]).toBe("/api/projects/p1/events")
    expect(bodyOf(post)).toEqual({ title: "Demo", date: "2026-09-03", color: "blue" })
    expect(await screen.findByText(t.calendarEventSaved)).toBeInTheDocument()
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => c[0] === "/api/projects/p1/events" && !methodOf(c)).length).toBeGreaterThanOrEqual(2),
    )
  })

  it("edits an existing event optimistically and rolls back on failure", async () => {
    extra = (_url, init) => (init?.method === "PATCH" ? jsonResponse({ error: "no" }, 500) : undefined)
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Planning" }))
    const dialog = await screen.findByRole("dialog", { name: t.eventEdit })
    const title = within(dialog).getByDisplayValue("Planning")
    await userEvent.clear(title)
    await userEvent.type(title, "Renamed")
    await userEvent.click(within(dialog).getByRole("button", { name: t.update }))
    expect(await screen.findByText(t.calendarSaveFailed)).toBeInTheDocument()
    const patch = fetchMock.mock.calls.find((c) => methodOf(c) === "PATCH")!
    expect(patch[0]).toBe("/api/projects/p1/events/e1")
    expect(bodyOf(patch).title).toBe("Renamed")
    expect(screen.getByRole("dialog", { name: t.eventEdit })).toBeInTheDocument()
    expect(screen.queryByTitle("Renamed")).not.toBeInTheDocument()
    expect(screen.getAllByTitle("Planning").length).toBeGreaterThan(0)
  })

  it("updates an event successfully and closes the dialog", async () => {
    extra = (_url, init) => (init?.method === "PATCH" ? jsonResponse({ ok: true }) : undefined)
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Planning" }))
    const dialog = await screen.findByRole("dialog", { name: t.eventEdit })
    await userEvent.type(within(dialog).getByDisplayValue("Planning"), "!")
    await userEvent.click(within(dialog).getByRole("button", { name: t.update }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("deletes an event after confirmation", async () => {
    extra = (_url, init) => (init?.method === "DELETE" ? new Response(null, { status: 204 }) : undefined)
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Planning" }))
    const dialog = await screen.findByRole("dialog", { name: t.eventEdit })
    await userEvent.click(within(dialog).getByRole("button", { name: t.delete }))
    const confirmDlg = await screen.findByRole("alertdialog")
    expect(confirmDlg).toHaveTextContent(t.eventDeleteConfirm)
    const buttons = within(confirmDlg).getAllByRole("button")
    await userEvent.click(buttons[buttons.length - 1])
    await waitFor(() => expect(screen.queryByRole("button", { name: "Planning" })).not.toBeInTheDocument())
    expect(fetchMock.mock.calls.some((c) => methodOf(c) === "DELETE")).toBe(true)
    expect(await screen.findByText(t.calendarEventDeleted)).toBeInTheDocument()
  })

  it("keeps the event when delete confirmation is cancelled", async () => {
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: "Planning" }))
    const dialog = await screen.findByRole("dialog", { name: t.eventEdit })
    await userEvent.click(within(dialog).getByRole("button", { name: t.delete }))
    const confirmDlg = await screen.findByRole("alertdialog")
    await userEvent.click(within(confirmDlg).getByRole("button", { name: t.cancel }))
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
    expect(screen.getByRole("dialog", { name: t.eventEdit })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => methodOf(c) === "DELETE")).toBe(false)
  })

  it("navigates months and returns to today", async () => {
    await renderPage()
    // The page h1 is the calendar title; the period label is a live h2.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.calendarTitle)
    const heading = periodHeading()
    expect(heading).toHaveTextContent("2026年9月")
    expect(heading).toHaveAttribute("aria-live", "polite")
    await userEvent.click(screen.getByRole("button", { name: t.calendarNext }))
    expect(heading).toHaveTextContent("2026年10月")
    await userEvent.click(screen.getByRole("button", { name: t.calendarPrev }))
    await userEvent.click(screen.getByRole("button", { name: t.calendarPrev }))
    expect(heading).toHaveTextContent("2026年8月")
    await userEvent.click(screen.getByRole("button", { name: t.calendarToday }))
    expect(heading).toHaveTextContent("2026年9月")
  })

  it("jumps to a month from the mini calendar and marks today", async () => {
    await renderPage()
    expect(screen.getAllByRole("button").some((b) => b.getAttribute("aria-current") === "date")).toBe(true)
    const label = new Date(2026, 9, 15).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" })
    await userEvent.click(screen.getAllByRole("button", { name: label })[0])
    expect(periodHeading()).toHaveTextContent("2026年10月")
  })

  it("switches to week view, shows events and opens dialogs from headers, events and slots", async () => {
    await renderPage()
    const weekBtn = screen.getByRole("button", { name: t.calendarWeekView })
    await userEvent.click(weekBtn)
    expect(weekBtn).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: t.calendarMonthView })).toHaveAttribute("aria-pressed", "false")
    expect(periodHeading()).toHaveTextContent(" - ")
    expect(screen.getAllByTitle("Offsite").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Long trip").length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole("button", { name: addLabel(2026, 8, 18) }))
    const dialog = await screen.findByRole("dialog", { name: t.eventAdd })
    expect(within(dialog).getByDisplayValue("2026-09-18")).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await userEvent.click(screen.getAllByTitle("Offsite")[0])
    expect(await screen.findByRole("dialog", { name: t.eventEdit })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    const slot = document.querySelector<HTMLElement>("div.cursor-pointer[aria-hidden]")!
    fireEvent.click(slot)
    expect(await screen.findByRole("dialog", { name: t.eventAdd })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    await userEvent.click(screen.getByRole("button", { name: t.calendarNext }))
    expect(screen.queryByTitle("Offsite")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.calendarPrev }))
    expect(screen.getAllByTitle("Offsite").length).toBeGreaterThan(0)
  })

  it("shows the team view with members and sprint blocks", async () => {
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: t.calendarTeamView }))
    expect(screen.getByText(t.calendarMembers)).toBeInTheDocument()
    expect(screen.getByText("TY")).toBeInTheDocument()
    expect(screen.getByText("DE")).toBeInTheDocument()
    expect(screen.getByText(t.rolePO)).toBeInTheDocument()
    expect(screen.getByText("guest")).toBeInTheDocument()
    expect(screen.getAllByText("Sprint A").length).toBeGreaterThan(0)
  })

  it("shows an empty state in team view when there are no members", async () => {
    extra = (url) => (url.endsWith("/members") ? jsonResponse([]) : undefined)
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: t.calendarTeamView }))
    expect(screen.getByText(t.calendarNoMembers)).toBeInTheDocument()
  })

  it("opens the deadline dialog from the due-tasks badge", async () => {
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: fmt(t.calendarTasksDue, { count: 2 }) }))
    const dialog = await screen.findByRole("dialog", {
      name: fmt(t.calendarDeadlineTitle, { sprint: "Sprint A", date: "2026-09-18" }),
    })
    expect(within(dialog).getByText(/#7/)).toBeInTheDocument()
    expect(within(dialog).getByText("Logout")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
  })

  it("navigates to the sprint when a sprint bar is clicked", async () => {
    await renderPage()
    const bar = screen.getAllByRole("button", { name: fmt(t.calendarSprintProgress, { sprint: "Sprint A", progress: 50 }) })[0]
    await userEvent.click(bar)
    expect(push).toHaveBeenCalledWith("/projects/p1/sprints?sprint=s1")
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("collapses extra events behind a toggle", async () => {
    await renderPage()
    const more = screen.getByRole("button", { name: fmt(t.calendarMoreEvents, { count: 1 }) })
    expect(more).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByTitle("Busy 5")).not.toBeInTheDocument()
    await userEvent.click(more)
    expect(screen.getByTitle("Busy 5")).toBeInTheDocument()
    const less = screen.getByRole("button", { name: t.calendarShowLess })
    expect(less).toHaveAttribute("aria-expanded", "true")
    await userEvent.click(less)
    expect(screen.queryByTitle("Busy 5")).not.toBeInTheDocument()
  })

  it("creates a multi-day event by dragging across days, and a day click opens the dialog", async () => {
    await renderPage()
    const cellOf = (d: number) =>
      screen.getByRole("button", { name: addLabel(2026, 8, d) }).closest("div.cursor-pointer") as HTMLElement
    fireEvent.mouseDown(cellOf(14))
    fireEvent.mouseEnter(cellOf(16))
    fireEvent.mouseUp(cellOf(16))
    const dialog = await screen.findByRole("dialog", { name: t.eventAdd })
    expect(within(dialog).getByDisplayValue("2026-09-14")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("2026-09-16")).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    fireEvent.click(cellOf(21))
    const d2 = await screen.findByRole("dialog", { name: t.eventAdd })
    expect(within(d2).getByDisplayValue("2026-09-21")).toBeInTheDocument()
  })

  it("shows a load-failure toast when a query fails", async () => {
    extra = (url) => (url.endsWith("/members") ? jsonResponse({ error: "x" }, 500) : undefined)
    renderWithProviders(<CalendarPage />)
    expect(await screen.findByText(t.calendarLoadFailed)).toBeInTheDocument()
  })
})
