import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { DORMANT_REMINDER_KEY } from "../dormant-reminder"
import type { Project } from "../types"

const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}))

const { ProjectList } = await import("../../project-list")
const t = tr("ja")
const DAY = 86_400_000

function project(over: Partial<Project> & { id: string; name: string }): Project {
  return {
    description: null,
    status: "active",
    projectType: "software",
    members: [],
    _count: { iceboxItems: 0, backlogItems: 0, sprints: 0 },
    progressPct: 0,
    lastActivityAt: new Date(Date.now() - DAY).toISOString(),
    ...over,
  }
}
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString()

const alpha = project({ id: "p1", name: "Alpha", myRole: "po", canUpdate: true, progressPct: 40, cardColor: "red" })
const sleepyPo = project({ id: "p2", name: "Sleepy PO", myRole: "po", canUpdate: true, lastActivityAt: ago(90) })
const sleepySm = project({ id: "p3", name: "Sleepy SM", myRole: "sm", canUpdate: true, lastActivityAt: ago(70) })
const sleepyDev = project({ id: "p4", name: "Sleepy Dev", myRole: "dev", canUpdate: false, lastActivityAt: ago(120) })
const viewOnly = project({ id: "p5", name: "Section view", myRole: null, canUpdate: false, projectType: "process_improvement" })
const ALL = [alpha, sleepyPo, sleepySm, sleepyDev, viewOnly]

function renderList(projects: Project[] = ALL) {
  return renderWithProviders(<ProjectList activeProjects={projects} archivedCount={0} categories={[]} isAdmin={false} />)
}

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
  }
}

let rectSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true })
  router.refresh.mockReset()
  rectSpy = vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 1, height: 1 }] as unknown as DOMRectList)
})
afterEach(() => {
  rectSpy.mockRestore()
  vi.unstubAllGlobals()
})

const patchBodies = (fetchMock: ReturnType<typeof stubFetch>) =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH").map(([url, init]) => [url, JSON.parse(String(init?.body))])

const rowOf = (name: string) => screen.getByRole("link", { name }).closest('[role="row"]') as HTMLElement

describe("list layout", () => {
  it("renders one row per project with column headers, role chip, last update, dormant badge and progress", async () => {
    window.localStorage.setItem("projectLayout", "list")
    const user = userEvent.setup()
    renderList()
    const table = screen.getByRole("table", { name: t.projectListTitle })
    const headers = within(table).getAllByRole("columnheader").map((h) => h.textContent)
    expect(headers).toEqual(expect.arrayContaining([t.projectListColName, t.projectListColRole, t.projectListColUpdated, t.projectProgress]))
    expect(within(table).getAllByTestId("project-list-row")).toHaveLength(ALL.length)

    const row = rowOf("Alpha")
    expect(within(row).getByRole("link", { name: "Alpha" })).toHaveAttribute("href", "/projects/p1")
    expect(within(row).getByText("PO")).toBeInTheDocument()
    expect(within(row).getByTestId("project-row-updated")).toHaveAttribute("title", expect.stringContaining("最終更新"))
    expect(within(row).getByText("40%")).toBeInTheDocument()
    expect(within(row).queryByTestId("project-dormant-badge")).toBeNull()
    expect(within(rowOf("Sleepy PO")).getByTestId("project-dormant-badge")).toHaveTextContent("休眠 90日")
    expect(within(rowOf("Section view")).getByText(t.projectListRoleViewer)).toBeInTheDocument()

    // The row menu is the existing options menu (categories, color, archive).
    await user.click(within(row).getByRole("button", { name: t.projectOptions }))
    const menu = screen.getByRole("menu", { name: t.projectOptions })
    expect(within(menu).getByRole("menuitem", { name: t.projectArchiveAction })).toBeInTheDocument()
  })

  it("toggles the favorite from the row and keeps the chosen layout after a remount", async () => {
    const fetchMock = stubFetch([{ match: "/api/projects/p1/favorite", respond: () => jsonResponse({ ok: true }) }])
    const user = userEvent.setup()
    const { unmount } = renderList()
    await user.click(screen.getByRole("button", { name: t.projectLayoutList }))
    await user.click(within(rowOf("Alpha")).getByRole("button", { name: t.projectFavorite }))
    expect(fetchMock).toHaveBeenCalled()
    unmount()
    renderList()
    expect(screen.getByRole("button", { name: t.projectLayoutList })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("table")).toBeInTheDocument()
  })
})

describe("group by my role", () => {
  it("shows role sections with counts (favorites first) and persists collapsed sections", async () => {
    const user = userEvent.setup()
    renderList([{ ...alpha, isFavorite: true }, sleepyPo, sleepySm, sleepyDev, viewOnly])
    await user.click(screen.getByRole("button", { name: t.projectGroupByRole }))
    expect(window.localStorage.getItem("projectViewMode")).toBe("role")

    const titles = screen.getAllByRole("button", { expanded: true }).map((b) => b.textContent)
    expect(titles).toEqual([
      `${t.projectGroupFavorites}(1)`,
      "PO のプロジェクト(1)",
      "SM のプロジェクト(1)",
      `${t.projectGroupRoleMember}(1)`,
      `${t.projectGroupRoleViewer}(1)`,
    ])
    const po = screen.getByTestId("project-section-role-po")
    expect(within(po).getByRole("link", { name: "Sleepy PO" })).toBeInTheDocument()
    expect(within(po).queryByRole("link", { name: "Alpha" })).toBeNull()

    await user.click(within(po).getByRole("button", { name: /PO のプロジェクト/ }))
    expect(within(po).queryByRole("link", { name: "Sleepy PO" })).toBeNull()
    expect(JSON.parse(window.localStorage.getItem("collapsedSections") ?? "{}")).toEqual({ "role-po": true })
  })

  it("applies filters inside the role grouping", async () => {
    window.localStorage.setItem("projectViewMode", "role")
    const user = userEvent.setup()
    renderList()
    await user.type(screen.getByRole("searchbox", { name: t.projectSearchPlaceholder }), "sleepy")
    expect(screen.queryByTestId("project-section-role-viewer")).toBeNull()
    expect(screen.getByTestId("project-section-role-member")).toBeInTheDocument()
  })
})

describe("dormant reminder banner", () => {
  it("shows the archivable dormant count; 整理する turns on the dormant filter", async () => {
    const user = userEvent.setup()
    renderList()
    const banner = await screen.findByTestId("dormant-banner")
    expect(banner).toHaveTextContent(t.projectDormantBannerTitle.replace("{count}", "2"))
    await user.click(within(banner).getByRole("button", { name: t.projectDormantBannerAction }))
    expect(screen.getByRole("button", { name: `${t.projectFilterDormantOnly} (3)` })).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByTestId("dormant-banner")).toBeNull()
    expect(screen.getByTestId("dormant-bulk-bar")).toBeInTheDocument()
  })

  it("dismissal hides it for 30 days (remembered in localStorage)", async () => {
    const user = userEvent.setup()
    const { unmount } = renderList()
    await user.click(within(await screen.findByTestId("dormant-banner")).getByRole("button", { name: t.projectDormantBannerDismiss }))
    expect(screen.queryByTestId("dormant-banner")).toBeNull()
    const until = Number(window.localStorage.getItem(DORMANT_REMINDER_KEY))
    expect(Math.round((until - Date.now()) / DAY)).toBe(30)
    unmount()
    renderList()
    expect(screen.queryByTestId("dormant-banner")).toBeNull()
  })

  it("is not shown when no dormant project can be archived by the viewer", () => {
    renderList([alpha, sleepyDev])
    expect(screen.queryByTestId("dormant-banner")).toBeNull()
  })
})

async function openBulkDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: `${t.projectFilterDormantOnly} (3)` }))
  await user.click(screen.getByRole("button", { name: t.projectBulkArchiveButton }))
  return screen.getByRole("dialog", { name: t.projectBulkArchiveTitle })
}

describe("bulk archive of dormant projects", () => {
  it("lists archivable and skipped projects; cancel archives nothing", async () => {
    const fetchMock = stubFetch([])
    const user = userEvent.setup()
    renderList()
    const dialog = await openBulkDialog(user)
    expect(within(dialog).getByTestId("bulk-archive-targets")).toHaveTextContent("Sleepy PO")
    expect(within(dialog).getByTestId("bulk-archive-targets")).toHaveTextContent("Sleepy SM")
    expect(within(dialog).getByTestId("bulk-archive-skipped")).toHaveTextContent("Sleepy Dev")
    expect(within(dialog).getByTestId("bulk-archive-targets")).not.toHaveTextContent("Sleepy Dev")
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(screen.queryByRole("dialog")).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("archives sequentially, closes on success, and Undo restores every project of the batch", async () => {
    const fetchMock = stubFetch([{ match: /\/api\/projects\/p\d$/, method: "PATCH", respond: () => jsonResponse({ ok: true }) }])
    const user = userEvent.setup()
    renderList()
    const dialog = await openBulkDialog(user)
    await user.click(within(dialog).getByRole("button", { name: t.projectBulkArchiveConfirm.replace("{count}", "2") }))

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull())
    expect(screen.queryByRole("link", { name: "Sleepy PO" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Sleepy SM" })).toBeNull()
    expect(await screen.findByText(t.projectBulkArchiveDone.replace("{count}", "2"))).toBeInTheDocument()
    expect(router.refresh).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: t.projectArchiveUndo }))
    expect(await screen.findByText(t.projectBulkArchiveUndone.replace("{count}", "2"))).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Sleepy PO" })).toBeInTheDocument()
    expect(patchBodies(fetchMock)).toEqual([
      ["/api/projects/p2", { status: "archived" }],
      ["/api/projects/p3", { status: "archived" }],
      ["/api/projects/p2", { status: "active" }],
      ["/api/projects/p3", { status: "active" }],
    ])
  })

  it("reports partial failures in the dialog and only undoes what was archived", async () => {
    const fetchMock = stubFetch([
      { match: "/api/projects/p2", method: "PATCH", respond: () => jsonResponse({ ok: true }) },
      { match: "/api/projects/p3", method: "PATCH", respond: () => jsonResponse({ error: "権限がありません" }, 403) },
    ])
    const user = userEvent.setup()
    renderList()
    const dialog = await openBulkDialog(user)
    await user.click(within(dialog).getByRole("button", { name: t.projectBulkArchiveConfirm.replace("{count}", "2") }))

    const failed = await within(dialog).findByTestId("bulk-archive-failed")
    expect(failed).toHaveTextContent("Sleepy SM: 権限がありません")
    expect(within(dialog).getByRole("alert")).toHaveTextContent(t.projectBulkArchivePartial.replace("{ok}", "1").replace("{failed}", "1"))
    expect(screen.queryByRole("link", { name: "Sleepy PO" })).toBeNull()
    expect(screen.getByRole("link", { name: "Sleepy SM" })).toBeInTheDocument()

    await user.click(within(dialog).getAllByRole("button", { name: t.close }).at(-1) as HTMLElement)
    expect(screen.queryByRole("dialog")).toBeNull()
    await user.click(screen.getByRole("button", { name: t.projectArchiveUndo }))
    await waitFor(() => expect(screen.getByRole("link", { name: "Sleepy PO" })).toBeInTheDocument())
    expect(patchBodies(fetchMock)).toEqual([
      ["/api/projects/p2", { status: "archived" }],
      ["/api/projects/p3", { status: "archived" }],
      ["/api/projects/p2", { status: "active" }],
    ])
  })
})
