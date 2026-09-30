import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}))

const { CategorySettings } = await import("../categories/category-settings")

const cats = [
  { id: "c1", name: "Work", color: "red", sortOrder: 0, assignments: [{ projectId: "p1" }] },
  { id: "c2", name: "Misc", color: "unknown", sortOrder: 1, assignments: [] },
]

let rectSpy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  rectSpy = vi.spyOn(HTMLElement.prototype, "getClientRects").mockImplementation(() => [{ width: 1, height: 1 }] as unknown as DOMRectList)
})
afterEach(() => {
  rectSpy.mockRestore()
  vi.unstubAllGlobals()
})

async function confirmDialog(user: ReturnType<typeof userEvent.setup>, accept: boolean) {
  const dialog = await screen.findByRole("alertdialog")
  const buttons = within(dialog).getAllByRole("button")
  await user.click(accept ? buttons[buttons.length - 1] : buttons[0])
}

describe("CategorySettings", () => {
  it("shows the empty state and localized text (en)", async () => {
    stubFetch([{ match: "/api/user/categories", respond: () => jsonResponse([]) }])
    const t = tr("en")
    renderWithProviders(<CategorySettings />, { language: "en" })
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    expect(await screen.findByText(t.categoryEmpty)).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.categorySettingsTitle)
  })

  it("lists categories and creates a new one", async () => {
    let list = [...cats]
    const fetchMock = stubFetch([
      { match: "/api/user/categories", method: "GET", respond: () => jsonResponse(list) },
      {
        match: "/api/user/categories",
        method: "POST",
        respond: (_u, init) => {
          list = [...list, { id: "c3", sortOrder: 2, assignments: [], ...JSON.parse(String(init?.body)) }]
          return jsonResponse({ ok: true }, 201)
        },
      },
    ])
    const user = userEvent.setup()
    const t = tr("ja")
    renderWithProviders(<CategorySettings />)
    expect(await screen.findByText("Work")).toBeInTheDocument()
    expect(screen.getByText(`1 ${t.categoryProjects}`)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: t.categoryNew }))
    const dialog = screen.getByRole("dialog", { name: t.categoryNew })
    const submit = within(dialog).getByRole("button", { name: t.create })
    expect(submit).toBeDisabled()
    await user.type(within(dialog).getByRole("textbox"), "Fun")
    await user.click(within(dialog).getByRole("button", { name: t.categoryColorGreen }))
    expect(within(dialog).getByRole("button", { name: t.categoryColorGreen })).toHaveAttribute("aria-pressed", "true")
    await user.click(submit)

    expect(await screen.findByText("Fun")).toBeInTheDocument()
    const post = fetchMock.mock.calls.find((c) => c[1]?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: "Fun", color: "green" })
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(screen.getByText(t.saved)).toBeInTheDocument()
  })

  it("edits a category and shows the server error inline on failure", async () => {
    stubFetch([
      { match: "/api/user/categories", method: "GET", respond: () => jsonResponse(cats) },
      { match: "/api/user/categories/c1", method: "PATCH", respond: () => jsonResponse({ error: "dup name" }, 409) },
    ])
    const user = userEvent.setup()
    const t = tr("ja")
    renderWithProviders(<CategorySettings />)
    await user.click(await screen.findByRole("button", { name: `${t.edit}: Work` }))
    const dialog = screen.getByRole("dialog", { name: t.categoryEdit })
    expect(within(dialog).getByRole("textbox")).toHaveValue("Work")
    await user.type(within(dialog).getByRole("textbox"), "!")
    await user.click(within(dialog).getByRole("button", { name: t.save }))
    expect(await within(dialog).findByText("dup name")).toBeInTheDocument()
  })

  it("asks for confirmation before deleting; cancel keeps the item", async () => {
    const fetchMock = stubFetch([{ match: "/api/user/categories", method: "GET", respond: () => jsonResponse(cats) }])
    const user = userEvent.setup()
    const t = tr("ja")
    renderWithProviders(<CategorySettings />)
    await user.click(await screen.findByRole("button", { name: `${t.delete}: Work` }))
    expect(within(await screen.findByRole("alertdialog")).getByText(t.categoryDeleteConfirm)).toBeInTheDocument()
    await confirmDialog(user, false)
    expect(fetchMock.mock.calls.some((c) => c[1]?.method === "DELETE")).toBe(false)
  })

  it("deletes after confirmation and toasts; a failure shows an error toast", async () => {
    let fail = false
    stubFetch([
      { match: "/api/user/categories", method: "GET", respond: () => jsonResponse(cats) },
      { match: /\/api\/user\/categories\/c\d/, method: "DELETE", respond: () => (fail ? jsonResponse({ error: "locked" }, 500) : jsonResponse({ ok: true })) },
    ])
    const user = userEvent.setup()
    const t = tr("ja")
    renderWithProviders(<CategorySettings />)
    await user.click(await screen.findByRole("button", { name: `${t.delete}: Work` }))
    await confirmDialog(user, true)
    expect(await screen.findByText(t.categoryDeleted)).toBeInTheDocument()

    fail = true
    await user.click(screen.getByRole("button", { name: `${t.delete}: Misc` }))
    await confirmDialog(user, true)
    await waitFor(() => expect(screen.getByText("locked")).toBeInTheDocument())
  })
})
