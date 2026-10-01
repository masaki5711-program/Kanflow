import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
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

const managed = project({ id: "p1", name: "Alpha", canUpdate: true })
const readOnly = project({ id: "p2", name: "Beta", canUpdate: false, lastActivityAt: new Date(Date.now() - 90 * DAY).toISOString() })
const oldArchived = project({ id: "p9", name: "Old", status: "archived", canUpdate: true })

function renderList(archivedCount = 1) {
  return renderWithProviders(<ProjectList activeProjects={[managed, readOnly]} archivedCount={archivedCount} categories={[]} isAdmin={false} />)
}

const card = (name: string) => screen.getByRole("link", { name }).closest("article") as HTMLElement

async function openMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(within(card(name)).getByRole("button", { name: t.projectOptions }))
  return screen.getByRole("menu", { name: t.projectOptions })
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

describe("archive from the card options menu", () => {
  it("offers the archive item only when the viewer may update the project", async () => {
    const user = userEvent.setup()
    renderList()
    const menu = await openMenu(user, "Alpha")
    expect(within(menu).getByRole("menuitem", { name: t.projectArchiveAction })).toBeInTheDocument()
    expect(within(menu).getByRole("separator")).toBeInTheDocument()
    await user.keyboard("{Escape}")

    const readOnlyMenu = await openMenu(user, "Beta")
    expect(within(readOnlyMenu).queryByRole("menuitem")).toBeNull()
  })

  it("is reachable with the keyboard (End focuses the archive item)", async () => {
    const user = userEvent.setup()
    renderList()
    const menu = await openMenu(user, "Alpha")
    await user.keyboard("{End}")
    expect(within(menu).getByRole("menuitem", { name: t.projectArchiveAction })).toHaveFocus()
  })

  it("does nothing when the confirmation is cancelled", async () => {
    const fetchMock = stubFetch([])
    const user = userEvent.setup()
    renderList()
    await user.click(within(await openMenu(user, "Alpha")).getByRole("menuitem", { name: t.projectArchiveAction }))
    const dialog = screen.getByRole("alertdialog")
    expect(dialog).toHaveTextContent(t.projectArchiveConfirm.replace("{name}", "Alpha"))
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument()
  })

  it("archives after confirmation, removes the card, and Undo restores it", async () => {
    const fetchMock = stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => jsonResponse({ id: "p1" }) }])
    const user = userEvent.setup()
    renderList()
    expect(screen.queryByRole("menu")).toBeNull()
    await user.click(within(await openMenu(user, "Alpha")).getByRole("menuitem", { name: t.projectArchiveAction }))
    expect(screen.queryByRole("menu")).toBeNull()
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.projectArchiveAction }))

    await waitFor(() => expect(screen.queryByRole("link", { name: "Alpha" })).toBeNull())
    expect(await screen.findByText(t.projectArchived)).toBeInTheDocument()
    expect(router.refresh).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole("button", { name: t.projectArchiveUndo }))
    expect(await screen.findByRole("link", { name: "Alpha" })).toBeInTheDocument()
    expect(await screen.findByText(t.projectUnarchived)).toBeInTheDocument()
    expect(patchBodies(fetchMock)).toEqual([
      ["/api/projects/p1", { status: "archived" }],
      ["/api/projects/p1", { status: "active" }],
    ])
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })

  it("keeps the card and shows an error toast when archiving fails", async () => {
    stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => jsonResponse({ error: "権限がありません" }, 403) }])
    const user = userEvent.setup()
    renderList()
    await user.click(within(await openMenu(user, "Alpha")).getByRole("menuitem", { name: t.projectArchiveAction }))
    await user.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: t.projectArchiveAction }))
    expect(await screen.findByText(`${t.projectArchiveFailed}: 権限がありません`)).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument()
    expect(router.refresh).not.toHaveBeenCalled()
  })

  it("restores from the archived section and refetches the loaded archived list after archiving", async () => {
    let archivedGets = 0
    const fetchMock = stubFetch([
      { match: "/api/projects/archived", method: "GET", respond: () => (archivedGets++, jsonResponse({ items: [oldArchived] })) },
      { match: /\/api\/projects\/p(1|9)$/, method: "PATCH", respond: () => jsonResponse({ ok: true }) },
    ])
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("button", { name: `${t.sprintStatusArchived} (1)` }))
    const oldLink = await screen.findByRole("link", { name: "Old" })
    await user.click(within(oldLink.closest("article") as HTMLElement).getByRole("button", { name: t.projectOptions }))
    const menu = screen.getByRole("menu")
    expect(within(menu).queryByRole("menuitem", { name: t.projectArchiveAction })).toBeNull()
    await user.click(within(menu).getByRole("menuitem", { name: t.projectUnarchiveAction }))
    expect(screen.queryByRole("alertdialog")).toBeNull() // restoring needs no confirmation
    await waitFor(() => expect(screen.queryByRole("link", { name: "Old" })).toBeNull())
    expect(await screen.findByText(t.projectUnarchived)).toBeInTheDocument()
    expect(patchBodies(fetchMock)).toEqual([["/api/projects/p9", { status: "active" }]])
    await waitFor(() => expect(archivedGets).toBe(2))
  })
})

describe("toolbar: last-activity sort and dormant filter", () => {
  it("sorts by last activity (persisted) and filters dormant projects", async () => {
    const user = userEvent.setup()
    renderList(0)
    const sort = screen.getByRole("combobox", { name: t.projectSortLabel })
    await user.selectOptions(sort, "activity_asc")
    expect(window.localStorage.getItem("projectSortBy")).toBe("activity_asc")
    let names = screen.getAllByRole("link").map((a) => a.textContent)
    expect(names.indexOf("Beta")).toBeLessThan(names.indexOf("Alpha"))
    await user.selectOptions(sort, "activity_desc")
    names = screen.getAllByRole("link").map((a) => a.textContent)
    expect(names.indexOf("Alpha")).toBeLessThan(names.indexOf("Beta"))

    const chip = screen.getByRole("button", { name: `${t.projectFilterDormantOnly} (1)` })
    expect(chip).toHaveAttribute("aria-pressed", "false")
    await user.click(chip)
    expect(chip).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("link", { name: "Alpha" })).toBeNull()
    expect(screen.getByRole("link", { name: "Beta" })).toBeInTheDocument()
    await user.click(chip)
    expect(screen.getByRole("link", { name: "Alpha" })).toBeInTheDocument()
  })

  it("hides the dormant chip when nothing is dormant", () => {
    renderWithProviders(<ProjectList activeProjects={[managed]} archivedCount={0} categories={[]} isAdmin={false} />)
    expect(screen.queryByRole("button", { name: new RegExp(t.projectFilterDormantOnly) })).toBeNull()
  })
})
