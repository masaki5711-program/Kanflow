import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { Category, Project } from "../types"

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

function project(over: Partial<Project> & { id: string; name: string }): Project {
  return {
    description: null,
    status: "active",
    projectType: "software",
    members: [{ role: "po", user: { id: "u1", name: "Tanaka" } }],
    _count: { iceboxItems: 1, backlogItems: 2, sprints: 3 },
    progressPct: 40,
    ...over,
  }
}

const active = [
  project({ id: "p1", name: "Alpha", description: "First", sections: [{ id: "s1", name: "Sec A" }], _count: { iceboxItems: 1, backlogItems: 2, sprints: 3, aiReports: 2 }, aiReports: [{ id: "r1", title: "🔴 Risk" }] }),
  project({ id: "p2", name: "Beta", projectType: "process_improvement", isFavorite: true, cardColor: "red", members: [{ role: "xx", user: { id: "u2", name: "Sato" } }], _count: { iceboxItems: 0, backlogItems: 0, sprints: 0, aiReports: 1 }, aiReports: [{ id: "r2", title: "ok" }] }),
]
const archived = [project({ id: "p9", name: "Old" })]
const categories: Category[] = [
  { id: "c1", name: "Work", color: "blue", sortOrder: 0, assignments: [{ projectId: "p1" }] },
  { id: "c2", name: "Hobby", color: "nope", sortOrder: 1, assignments: [] },
]

function renderList(props: Partial<Parameters<typeof ProjectList>[0]> = {}, language: "ja" | "en" | "id" = "ja") {
  return renderWithProviders(
    <ProjectList activeProjects={active} archivedCount={archived.length} categories={categories} isAdmin={false} {...props} />,
    { language },
  )
}

function card(name: string): HTMLElement {
  return screen.getByRole("link", { name }).closest("article, div.group") as HTMLElement
}

function memoryStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    clear: () => m.clear(),
    getItem: (k) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k, v) => void m.set(k, String(v)),
    removeItem: (k) => void m.delete(k),
    key: (i) => [...m.keys()][i] ?? null,
  }
}

let rectSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  Object.defineProperty(window, "localStorage", { value: memoryStorage(), configurable: true, writable: true })
  router.refresh.mockReset()
  rectSpy = vi
    .spyOn(HTMLElement.prototype, "getClientRects")
    .mockImplementation(() => [{ width: 1, height: 1 }] as unknown as DOMRectList)
})
afterEach(() => {
  rectSpy.mockRestore()
  vi.unstubAllGlobals()
})

describe("ProjectList rendering", () => {
  it("shows an empty state with a create action when there are no projects", () => {
    renderList({ activeProjects: [], archivedCount: 0, categories: [] })
    expect(screen.getByText(t.projectListEmpty)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.projectCreateButton })).toBeInTheDocument()
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument()
  })

  it("renders cards with counts, badges, progress and members", () => {
    renderList()
    const alpha = card("Alpha")
    expect(within(alpha).getByText("First")).toBeInTheDocument()
    expect(within(alpha).getByText("Sec A")).toBeInTheDocument()
    expect(within(alpha).getByText("Work")).toBeInTheDocument()
    expect(within(alpha).getByRole("progressbar")).toHaveAttribute("aria-valuenow", "40")
    expect(within(alpha).getByText(t.projectCountAiReports)).toBeInTheDocument()
    expect(within(card("Beta")).getByRole("button", { name: t.projectFavorite })).toHaveAttribute("aria-pressed", "true")
    expect(within(card("Beta")).getByText("xx")).toBeInTheDocument()
  })

  it("filters by search and type, and shows the no-match state", async () => {
    const user = userEvent.setup()
    renderList()
    const search = screen.getByRole("searchbox", { name: t.projectSearchPlaceholder })
    await user.type(search, "sato")
    expect(screen.queryByRole("link", { name: "Alpha" })).not.toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Beta" })).toBeInTheDocument()
    await user.clear(search)
    await user.type(search, "nothing-here")
    expect(screen.getByText(t.projectNoMatch)).toBeInTheDocument()
    await user.clear(search)

    const typeGroup = screen.getByRole("group", { name: t.projectTypeFilterLabel })
    const buttons = within(typeGroup).getAllByRole("button")
    await user.click(buttons[1]) // software
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true")
    expect(screen.queryByRole("link", { name: "Beta" })).not.toBeInTheDocument()
    await user.click(within(typeGroup).getByRole("button", { name: t.userFilterRoleAll }))
    expect(screen.getByRole("link", { name: "Beta" })).toBeInTheDocument()
  })

  it("persists sort and density preferences and switches to compact rows", async () => {
    const user = userEvent.setup()
    renderList()
    await user.selectOptions(screen.getByRole("combobox", { name: t.projectSortLabel }), "name_asc")
    expect(window.localStorage.getItem("projectSortBy")).toBe("name_asc")
    const links = screen.getAllByRole("link").map((a) => a.textContent)
    expect(links.indexOf("Beta")).toBeLessThan(links.indexOf("Alpha"))

    await user.click(screen.getByRole("button", { name: t.projectDensityCompact }))
    expect(window.localStorage.getItem("projectDensity")).toBe("compact")
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.projectDensityComfortable }))
    expect(screen.getAllByRole("progressbar").length).toBeGreaterThan(0)
  })

  it("ignores invalid stored preferences and falls back to defaults", () => {
    window.localStorage.setItem("projectSortBy", "bogus")
    window.localStorage.setItem("collapsedSections", "{not json")
    window.localStorage.setItem("projectViewMode", "category")
    renderList()
    expect(screen.getByRole("combobox", { name: t.projectSortLabel })).toHaveValue("updated")
    // category view with a broken collapsed map → everything expanded
    expect(screen.getByRole("region", { name: "Work" })).toBeInTheDocument()
  })

  it("groups by category, shows uncategorized, and persists collapsed sections", async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("button", { name: t.categoryCategory }))
    expect(window.localStorage.getItem("projectViewMode")).toBe("category")
    const work = screen.getByRole("region", { name: "Work" })
    expect(within(work).getByRole("link", { name: "Alpha" })).toBeInTheDocument()
    const uncategorized = screen.getByRole("region", { name: t.categoryUncategorized })
    expect(within(uncategorized).getByRole("link", { name: "Beta" })).toBeInTheDocument()

    const header = within(work).getByRole("button", { expanded: true })
    await user.click(header)
    expect(JSON.parse(window.localStorage.getItem("collapsedSections") ?? "{}")).toEqual({ "cat-c1": true })
    expect(within(work).queryByRole("link", { name: "Alpha" })).not.toBeInTheDocument()

    // Search that matches nothing → empty state in category view
    await user.type(screen.getByRole("searchbox"), "zzzz")
    expect(screen.getByText(t.projectListNoActive)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.categoryFlat }))
    expect(screen.getByText(t.projectNoMatch)).toBeInTheDocument()
  })

  it("loads the archived projects only when the section is first expanded", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([{ match: "/api/projects/archived", method: "GET", respond: () => jsonResponse({ items: archived }) }])
    renderList()
    expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
    const toggle = screen.getByRole("button", { name: `${t.sprintStatusArchived} (1)` })
    await user.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(await screen.findByRole("link", { name: "Old" })).toBeInTheDocument()
    // Collapse + expand again reuses the loaded list.
    await user.click(toggle)
    expect(screen.queryByRole("link", { name: "Old" })).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByRole("link", { name: "Old" })).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("shows an error with retry when the archived projects fail to load", async () => {
    const user = userEvent.setup()
    let calls = 0
    stubFetch([
      {
        match: "/api/projects/archived",
        method: "GET",
        respond: () => (++calls === 1 ? jsonResponse({ error: "boom" }, 500) : jsonResponse({ items: archived })),
      },
    ])
    renderList()
    await user.click(screen.getByRole("button", { name: `${t.sprintStatusArchived} (1)` }))
    expect(await screen.findByText(t.topArchivedLoadFailed)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.topRetry }))
    expect(await screen.findByRole("link", { name: "Old" })).toBeInTheDocument()
  })

  it("hides the archived section when there are none", () => {
    renderList({ archivedCount: 0 })
    expect(screen.queryByRole("button", { name: new RegExp(t.sprintStatusArchived) })).not.toBeInTheDocument()
  })

  it.each(["en", "id"] as const)("renders localized toolbar labels in %s", (lang) => {
    const tl = tr(lang)
    renderList({}, lang)
    expect(screen.getByRole("searchbox", { name: tl.projectSearchPlaceholder })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: tl.projectCreateButton })).toBeInTheDocument()
  })
})

describe("ProjectList actions", () => {
  it("toggles favorite optimistically and keeps it on success", async () => {
    const fetchMock = stubFetch([{ match: "/api/projects/p1/favorite", method: "POST", respond: () => jsonResponse({ ok: true }) }])
    const user = userEvent.setup()
    renderList()
    const star = within(card("Alpha")).getByRole("button", { name: t.projectFavorite })
    await user.click(star)
    expect(star).toHaveAttribute("aria-pressed", "true")
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(star).toHaveAttribute("aria-pressed", "true")
  })

  it("rolls back favorite and shows a toast when the request fails", async () => {
    stubFetch([{ match: "/api/projects/p2/favorite", method: "DELETE", respond: () => jsonResponse({ error: "nope" }, 500) }])
    const user = userEvent.setup()
    renderList()
    const star = within(card("Beta")).getByRole("button", { name: t.projectFavorite })
    await user.click(star)
    await waitFor(() => expect(screen.getByText(t.projectFavoriteFailed)).toBeInTheDocument())
    expect(star).toHaveAttribute("aria-pressed", "true")
  })

  it("opens the options menu with keyboard navigation and restores focus on Escape", async () => {
    const user = userEvent.setup()
    renderList()
    const trigger = within(card("Alpha")).getByRole("button", { name: t.projectOptions })
    await user.click(trigger)
    const menu = screen.getByRole("menu", { name: t.projectOptions })
    const items = Array.from(menu.querySelectorAll<HTMLElement>("[role^=menuitem]"))
    expect(items[0]).toHaveFocus()
    expect(items[0]).toHaveAttribute("aria-checked", "true") // Work assigned
    expect(trigger).toHaveAttribute("aria-expanded", "true")

    fireEvent.keyDown(menu, { key: "ArrowDown" })
    expect(items[1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: "ArrowUp" })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: "ArrowUp" })
    expect(items[items.length - 1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: "Home" })
    expect(items[0]).toHaveFocus()
    fireEvent.keyDown(menu, { key: "End" })
    expect(items[items.length - 1]).toHaveFocus()
    fireEvent.keyDown(menu, { key: "x" })

    fireEvent.keyDown(menu, { key: "Escape" })
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it("closes the menu on Tab, on outside click and when the trigger is clicked again", async () => {
    const user = userEvent.setup()
    renderList()
    const trigger = within(card("Alpha")).getByRole("button", { name: t.projectOptions })
    await user.click(trigger)
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" })
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByRole("menu")).toBeInTheDocument()
    await user.click(trigger)
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()

    fireEvent.contextMenu(card("Beta"), { clientX: 10, clientY: 20 })
    expect(screen.getByRole("menu")).toBeInTheDocument()
    await user.click(screen.getByText("First"))
    expect(screen.queryByRole("menu")).not.toBeInTheDocument()
  })

  it("assigns a category optimistically and rolls back with a toast on failure", async () => {
    const fetchMock = stubFetch([
      { match: "/api/user/categories/c2/assignments", method: "POST", respond: () => jsonResponse({ error: "x" }, 500) },
      { match: /\/api\/user\/categories\/c1\/assignments\?projectId=p1/, method: "DELETE", respond: () => jsonResponse({ ok: true }) },
    ])
    const user = userEvent.setup()
    renderList()
    await user.click(within(card("Alpha")).getByRole("button", { name: t.projectOptions }))
    const menu = screen.getByRole("menu")
    const [work, hobby] = within(menu).getAllByRole("menuitemcheckbox")

    await user.click(work)
    await waitFor(() => expect(work).toHaveAttribute("aria-checked", "false"))
    expect(fetchMock).toHaveBeenCalledWith("/api/user/categories/c1/assignments?projectId=p1", expect.objectContaining({ method: "DELETE" }))

    await user.click(hobby)
    await waitFor(() => expect(screen.getByText(t.projectCategoryAssignFailed)).toBeInTheDocument())
    expect(hobby).toHaveAttribute("aria-checked", "false")
  })

  it("sets and resets the card color; a failure rolls back with a toast", async () => {
    let fail = false
    const fetchMock = stubFetch([
      { match: "/api/projects/p1", method: "PATCH", respond: () => (fail ? jsonResponse({ error: "x" }, 500) : jsonResponse({ ok: true })) },
    ])
    const user = userEvent.setup()
    renderList()
    await user.click(within(card("Alpha")).getByRole("button", { name: t.projectOptions }))
    const menu = screen.getByRole("menu")
    await user.click(within(menu).getByRole("menuitemradio", { name: t.projectColorGreen }))
    await waitFor(() => expect(within(menu).getByRole("menuitemradio", { name: t.projectColorGreen })).toHaveAttribute("aria-checked", "true"))
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ body: JSON.stringify({ cardColor: "green" }) }))

    fail = true
    await user.click(within(menu).getByRole("menuitemradio", { name: new RegExp(t.projectCardColorDefault) }))
    await waitFor(() => expect(screen.getByText(t.projectCardColorFailed)).toBeInTheDocument())
    expect(within(menu).getByRole("menuitemradio", { name: t.projectColorGreen })).toHaveAttribute("aria-checked", "true")
  })

  it("renames a project inline and refreshes on success", async () => {
    const fetchMock = stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => jsonResponse({ ok: true }) }])
    const user = userEvent.setup()
    renderList()
    await user.click(within(card("Alpha")).getByRole("button", { name: t.projectEditName }))
    const input = screen.getByRole("textbox", { name: t.projectEditName })
    await user.clear(input)
    await user.type(input, "Alpha 2{Enter}")
    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/p1", expect.objectContaining({ body: JSON.stringify({ name: "Alpha 2" }) }))
    await waitFor(() => expect(screen.queryByRole("textbox", { name: t.projectEditName })).not.toBeInTheDocument())
  })

  it("keeps the editor open and toasts when rename fails; Escape and unchanged blur cancel", async () => {
    stubFetch([{ match: "/api/projects/p1", method: "PATCH", respond: () => jsonResponse({ error: "taken" }, 409) }])
    const user = userEvent.setup()
    renderList()
    await user.click(within(card("Alpha")).getByRole("button", { name: t.projectEditName }))
    const input = screen.getByRole("textbox", { name: t.projectEditName })
    await user.type(input, "X{Enter}")
    await waitFor(() => expect(screen.getByText(`${t.projectRenameFailed}: taken`)).toBeInTheDocument())
    expect(screen.getByRole("textbox", { name: t.projectEditName })).toBeInTheDocument()

    await user.type(input, "{Escape}")
    expect(screen.queryByRole("textbox", { name: t.projectEditName })).not.toBeInTheDocument()

    await user.click(within(card("Alpha")).getByRole("button", { name: t.projectEditName }))
    act(() => screen.getByRole("textbox", { name: t.projectEditName }).blur())
    expect(screen.queryByRole("textbox", { name: t.projectEditName })).not.toBeInTheDocument()
  })

  it("renames in compact row mode too", async () => {
    window.localStorage.setItem("projectDensity", "compact")
    const user = userEvent.setup()
    renderList()
    const row = screen.getByRole("link", { name: "Beta" }).closest("div.group") as HTMLElement
    await user.click(within(row).getByRole("button", { name: t.projectEditName }))
    expect(within(row).getByRole("textbox", { name: t.projectEditName })).toHaveValue("Beta")
  })
})

describe("ProjectCreateModal", () => {
  it("validates the name, creates the project and refreshes", async () => {
    const fetchMock = stubFetch([{ match: "/api/projects", method: "POST", respond: () => jsonResponse({ id: "new" }, 201) }])
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("button", { name: t.projectCreateButton }))
    const dialog = screen.getByRole("dialog", { name: t.projectCreateTitle })
    const submit = within(dialog).getByRole("button", { name: t.create })
    expect(submit).toBeDisabled()

    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(t.projectName) }), "   ")
    expect(submit).toBeDisabled()
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(t.projectName) }), "New one ")
    await user.type(within(dialog).getByRole("textbox", { name: t.projectDescription }), "desc")
    const radios = within(dialog).getAllByRole("radio")
    await user.click(radios[1])
    expect(radios[1]).toBeChecked()
    await user.click(submit)

    await waitFor(() => expect(router.refresh).toHaveBeenCalled())
    const body = JSON.parse(fetchMock.mock.calls[0][1]?.body as string)
    expect(body).toEqual({ name: "New one", description: "desc", projectType: radios[1].getAttribute("value") })
    expect(screen.getByText(t.projectCreated)).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("shows an error toast and keeps the modal when creation fails", async () => {
    stubFetch([{ match: "/api/projects", method: "POST", respond: () => jsonResponse({ error: "dup" }, 400) }])
    const user = userEvent.setup()
    renderList({}, "en")
    const te = tr("en")
    await user.click(screen.getByRole("button", { name: te.projectCreateButton }))
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(te.projectName) }), "X")
    await user.click(within(dialog).getByRole("button", { name: te.create }))
    await waitFor(() => expect(screen.getByText(`${te.projectCreateFailed}: dup`)).toBeInTheDocument())
    expect(screen.getByRole("dialog")).toBeInTheDocument()
  })

  it("asks before discarding a dirty form and closes after confirmation", async () => {
    const user = userEvent.setup()
    renderList()
    await user.click(screen.getByRole("button", { name: t.projectCreateButton }))
    const dialog = screen.getByRole("dialog")
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(t.projectName) }), "draft")
    await user.click(within(dialog).getByRole("button", { name: t.cancel }))
    const alert = await screen.findByRole("alertdialog")
    const buttons = within(alert).getAllByRole("button")
    await user.click(buttons[buttons.length - 1])
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

    // Reopening starts from an empty form.
    await user.click(screen.getByRole("button", { name: t.projectCreateButton }))
    expect(within(screen.getByRole("dialog")).getByRole("textbox", { name: new RegExp(t.projectName) })).toHaveValue("")
  })
})
