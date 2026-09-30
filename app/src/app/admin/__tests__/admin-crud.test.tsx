import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))
vi.mock("@/components/user-management-base", () => ({
  UserManagementBase: ({ headerExtra }: { headerExtra: ReactNode }) => <div data-testid="umb">{headerExtra}</div>,
}))

const { SectionManagement } = await import("../sections/section-management")
const { AdminCategoryManagement } = await import("../categories/admin-category-management")
const { UserManagement } = await import("../users/user-management")

const t = tr("ja")

let rectSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  rectSpy = vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 1, height: 1 }] as unknown as DOMRectList)
})
afterEach(() => {
  rectSpy.mockRestore()
  vi.unstubAllGlobals()
})

async function answerConfirm(user: ReturnType<typeof userEvent.setup>, accept: boolean) {
  const dialog = await screen.findByRole("alertdialog")
  const buttons = within(dialog).getAllByRole("button")
  await user.click(accept ? buttons[buttons.length - 1] : buttons[0])
}

const sections = [
  { id: "s1", name: "Assembly", description: "Line A", sortOrder: 1, _count: { users: 3, projects: 2, categories: 1 } },
  { id: "s2", name: "Paint", description: null, sortOrder: 2, _count: { users: 0, projects: 0, categories: 0 } },
]

describe("UserManagement", () => {
  it("wraps the shared base with a back link", () => {
    renderWithProviders(<UserManagement />)
    expect(within(screen.getByTestId("umb")).getByRole("link", { name: t.projectBackToList })).toHaveAttribute("href", "/")
  })
})

describe("SectionManagement", () => {
  it("renders the empty state", async () => {
    stubFetch([{ match: "/api/admin/sections", respond: () => jsonResponse([]) }])
    renderWithProviders(<SectionManagement />)
    expect(await screen.findByText(t.sectionEmpty)).toBeInTheDocument()
  })

  it("renders the table in English and Indonesian", async () => {
    for (const lang of ["en", "id"] as const) {
      stubFetch([{ match: "/api/admin/sections", respond: () => jsonResponse(sections) }])
      const { unmount } = renderWithProviders(<SectionManagement />, { language: lang })
      const table = await screen.findByRole("table")
      expect(within(table).getByRole("columnheader", { name: tr(lang).sectionName })).toBeInTheDocument()
      expect(within(table).getByRole("rowheader", { name: "Assembly" })).toBeInTheDocument()
      expect(within(table).getByText("—")).toBeInTheDocument()
      unmount()
    }
  })

  it("adds a section with trimmed values", async () => {
    let list = [...sections]
    const fetchMock = stubFetch([
      { match: "/api/admin/sections", method: "GET", respond: () => jsonResponse(list) },
      {
        match: "/api/admin/sections",
        method: "POST",
        respond: (_u, init) => {
          const body = JSON.parse(String(init?.body))
          list = [...list, { id: "s3", ...body, _count: { users: 0, projects: 0, categories: 0 } }]
          return jsonResponse({ ok: true }, 201)
        },
      },
    ])
    const user = userEvent.setup()
    renderWithProviders(<SectionManagement />)
    await screen.findByRole("table")
    await user.click(screen.getByRole("button", { name: t.sectionAdd }))
    const dialog = screen.getByRole("dialog", { name: t.sectionAdd })
    const submit = within(dialog).getByRole("button", { name: t.add })
    expect(submit).toBeDisabled()
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(t.sectionName) }), " Weld ")
    await user.type(within(dialog).getByRole("textbox", { name: t.sectionDescription }), "   ")
    const sort = within(dialog).getByRole("spinbutton", { name: t.sectionSortOrder })
    await user.clear(sort)
    await user.type(sort, "5")
    await user.click(submit)
    expect(await screen.findByRole("rowheader", { name: "Weld" })).toBeInTheDocument()
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: "Weld", description: null, sortOrder: 5 })
  })

  it("maps a 409 on edit to the duplicate-name message, other errors verbatim", async () => {
    let status = 409
    stubFetch([
      { match: "/api/admin/sections", method: "GET", respond: () => jsonResponse(sections) },
      { match: "/api/admin/sections/s1", method: "PATCH", respond: () => jsonResponse({ error: "server says no" }, status) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<SectionManagement />)
    await user.click(await screen.findByRole("button", { name: `${t.edit}: Assembly` }))
    const dialog = screen.getByRole("dialog", { name: t.sectionEdit })
    expect(within(dialog).getByRole("textbox", { name: t.sectionDescription })).toHaveValue("Line A")
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    expect(await within(dialog).findByText(t.sectionDuplicateName)).toBeInTheDocument()
    status = 500
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    expect(await within(dialog).findByText("server says no")).toBeInTheDocument()
  })

  it("confirms before delete; cancel does nothing, accept deletes, failure toasts", async () => {
    let fail = false
    const fetchMock = stubFetch([
      { match: "/api/admin/sections", method: "GET", respond: () => jsonResponse(sections) },
      { match: /\/api\/admin\/sections\/s\d/, method: "DELETE", respond: () => (fail ? jsonResponse({ error: "in use" }, 409) : jsonResponse({ ok: true })) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<SectionManagement />)
    const del = await screen.findByRole("button", { name: `${t.sectionDelete}: Assembly` })
    await user.click(del)
    await answerConfirm(user, false)
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false)

    await user.click(del)
    await answerConfirm(user, true)
    expect(await screen.findByText(t.sectionDeleted)).toBeInTheDocument()

    fail = true
    await user.click(screen.getByRole("button", { name: `${t.sectionDelete}: Paint` }))
    await answerConfirm(user, true)
    await waitFor(() => expect(screen.getByText("in use")).toBeInTheDocument())
  })
})

describe("AdminCategoryManagement", () => {
  const refs = [{ id: "s1", name: "Assembly" }, { id: "s2", name: "Paint" }]
  const adminCats = [
    { id: "g1", name: "Global cat", color: "blue", sortOrder: 0, sectionId: null, section: null, _count: { assignments: 4 } },
    { id: "a1", name: "Assembly cat", color: "weird", sortOrder: 1, sectionId: "s1", section: refs[0], _count: { assignments: 0 } },
  ]

  it("shows skeleton, then groups global and per-section categories with empty groups", async () => {
    stubFetch([
      { match: "/api/admin/sections", respond: () => jsonResponse(refs) },
      { match: "/api/admin/categories", respond: () => jsonResponse(adminCats) },
    ])
    renderWithProviders(<AdminCategoryManagement />)
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    const global = await screen.findByRole("region", { name: t.categoryScopeGlobal })
    expect(within(global).getByText("Global cat")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Assembly" })).getByText("Assembly cat")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "Paint" })).getByText(t.categoryGroupEmpty)).toBeInTheDocument()
  })

  it("shows the global group even when there are no categories", async () => {
    stubFetch([
      { match: "/api/admin/sections", respond: () => jsonResponse([]) },
      { match: "/api/admin/categories", respond: () => jsonResponse([]) },
    ])
    renderWithProviders(<AdminCategoryManagement />, { language: "id" })
    expect(await screen.findByRole("region", { name: tr("id").categoryScopeGlobal })).toBeInTheDocument()
  })

  it("creates a section-scoped category", async () => {
    const fetchMock = stubFetch([
      { match: "/api/admin/sections", respond: () => jsonResponse(refs) },
      { match: "/api/admin/categories", method: "GET", respond: () => jsonResponse(adminCats) },
      { match: "/api/admin/categories", method: "POST", respond: () => jsonResponse({ ok: true }, 201) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<AdminCategoryManagement />)
    await screen.findByText("Global cat")
    await user.click(screen.getByRole("button", { name: t.categoryAdd }))
    const dialog = screen.getByRole("dialog", { name: t.categoryAdd })
    await user.type(within(dialog).getByRole("textbox", { name: new RegExp(t.categoryName) }), "New")
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t.categoryScope }), "s2")
    await user.click(within(dialog).getByRole("button", { name: t.categoryColorRose }))
    const sort = within(dialog).getByRole("spinbutton", { name: t.categorySortOrder })
    await user.clear(sort)
    await user.type(sort, "abc")
    await user.click(within(dialog).getByRole("button", { name: t.add }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: "New", color: "rose", sortOrder: 0, sectionId: "s2" })
    expect(screen.getByText(t.saved)).toBeInTheDocument()
  })

  it("edits with a global scope (null section) and handles 409 / generic errors", async () => {
    let status = 409
    const fetchMock = stubFetch([
      { match: "/api/admin/sections", respond: () => jsonResponse(refs) },
      { match: "/api/admin/categories", method: "GET", respond: () => jsonResponse(adminCats) },
      { match: "/api/admin/categories/a1", method: "PATCH", respond: () => (status === 200 ? jsonResponse({ ok: true }) : jsonResponse({ error: "nope" }, status)) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<AdminCategoryManagement />)
    await user.click(await screen.findByRole("button", { name: `${t.edit}: Assembly cat` }))
    const dialog = screen.getByRole("dialog", { name: t.categoryEdit })
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t.categoryScope }), "")
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    expect(await within(dialog).findByText(t.sectionDuplicateName)).toBeInTheDocument()
    status = 400
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    expect(await within(dialog).findByText("nope")).toBeInTheDocument()
    status = 200
    await user.click(within(dialog).getByRole("button", { name: t.update }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    const patch = fetchMock.mock.calls.filter((c) => c[1]?.method === "PATCH").pop()
    expect(JSON.parse(String(patch?.[1]?.body))).toMatchObject({ sectionId: null, name: "Assembly cat" })
  })

  it("confirms before delete and reports failures", async () => {
    let fail = false
    stubFetch([
      { match: "/api/admin/sections", respond: () => jsonResponse(refs) },
      { match: "/api/admin/categories", method: "GET", respond: () => jsonResponse(adminCats) },
      { match: /\/api\/admin\/categories\/\w+/, method: "DELETE", respond: () => (fail ? jsonResponse({ error: "busy" }, 500) : jsonResponse({ ok: true })) },
    ])
    const user = userEvent.setup()
    renderWithProviders(<AdminCategoryManagement />)
    await user.click(await screen.findByRole("button", { name: `${t.delete}: Global cat` }))
    await answerConfirm(user, false)
    await user.click(screen.getByRole("button", { name: `${t.delete}: Global cat` }))
    await answerConfirm(user, true)
    expect(await screen.findByText(t.categoryDeleted)).toBeInTheDocument()
    fail = true
    await user.click(screen.getByRole("button", { name: `${t.delete}: Assembly cat` }))
    await answerConfirm(user, true)
    expect(await screen.findByText("busy")).toBeInTheDocument()
  })
})
