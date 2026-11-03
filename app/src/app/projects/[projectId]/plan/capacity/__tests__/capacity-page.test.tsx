import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/app-shell/project-title-context", () => ({ useProjectDocumentTitle: () => undefined }))

const CapacityPage = (await import("../page")).default
const t = tr("ja")

const row = (userId: string, name: string, maxUtilization: number) => ({ userId, name, maxUtilization, daysOver: maxUtilization > 1 ? 2 : 0, overlapDays: 1, days: [{ date: "2026-11-02", utilization: maxUtilization }] })

afterEach(() => vi.unstubAllGlobals())

describe("capacity and load page (plan 12 E4)", () => {
  it("a developer sees only their own load, says so, and has no allocation section", async () => {
    stubFetch([
      { match: /\/plan\/member-load\?/, method: "GET", respond: () => jsonResponse({ members: [row("u2", "開発2", 0.6)], canViewOthers: false, canManageAllocations: false, viewerId: "u2" }) },
      { match: "/api/users/u2/capacity", method: "GET", respond: () => jsonResponse({ capacities: [] }) },
    ])
    renderWithProviders(<CapacityPage />)
    expect(await screen.findByRole("rowheader", { name: "開発2" })).toBeInTheDocument()
    expect(screen.getByText(t.pcpLoadOwnOnly)).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: t.pcpAllocTitle })).not.toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: t.pcpOwnTitle })).toBeInTheDocument()
  })

  it("a PO sees every member's utilization and the allocation section", async () => {
    stubFetch([
      { match: /\/plan\/member-load\?/, method: "GET", respond: () => jsonResponse({ members: [row("u1", "PO", 0.5), row("u2", "開発2", 1.5)], canViewOthers: true, canManageAllocations: true, viewerId: "u1" }) },
      { match: "/api/projects/p1/capacity", method: "GET", respond: () => jsonResponse({ members: [{ userId: "u2", name: "開発2" }], allocations: [] }) },
      { match: "/api/users/u1/capacity", method: "GET", respond: () => jsonResponse({ capacities: [] }) },
    ])
    renderWithProviders(<CapacityPage />)
    expect(await screen.findByRole("rowheader", { name: "開発2" })).toBeInTheDocument()
    expect(screen.getByText("150%")).toBeInTheDocument()
    expect(await screen.findByRole("heading", { name: t.pcpAllocTitle })).toBeInTheDocument()
  })

  it("adds an own-FTE period as a 0..1 share; each wrong field says what is wrong, gets focus, and clears on edit", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: /\/plan\/member-load\?/, method: "GET", respond: () => jsonResponse({ members: [], canViewOthers: false, canManageAllocations: false, viewerId: "u2" }) },
      { match: "/api/users/u2/capacity", method: "GET", respond: () => jsonResponse({ capacities: [] }) },
      { match: "/api/users/u2/capacity", method: "POST", respond: () => jsonResponse({ id: "c1" }, 201) },
    ])
    renderWithProviders(<CapacityPage />)
    const fromInput = await screen.findByLabelText(new RegExp(t.pcpFieldFrom))
    const share = screen.getByLabelText(new RegExp(t.pcpFieldFte.replace(/[()（）%]/g, ".")))
    // Nothing entered, and an empty share is not 0 %: both fields are named, the first gets focus.
    await user.clear(share)
    await user.click(screen.getByRole("button", { name: t.pcpAdd }))
    expect(screen.getByText(t.pcpErrFrom)).toBeInTheDocument()
    expect(screen.getByText(t.pcpErrFte)).toBeInTheDocument()
    expect(fromInput).toHaveFocus()
    expect(fromInput).toHaveAttribute("aria-invalid", "true")
    await user.type(fromInput, "2026-11-01")
    expect(screen.queryByText(t.pcpErrFrom)).not.toBeInTheDocument()
    await user.type(share, "150")
    await user.click(screen.getByRole("button", { name: t.pcpAdd }))
    expect(screen.getByText(t.pcpErrFte)).toBeInTheDocument()
    expect(share).toHaveFocus()
    await user.clear(share)
    await user.type(share, "60")
    await user.click(screen.getByRole("button", { name: t.pcpAdd }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ from: "2026-11-01", to: null, fte: 0.6 })
  })

  it("removing a row moves focus to the next row's button (and to the heading when the list is empty)", async () => {
    const user = userEvent.setup()
    let rows = [
      { id: "c1", userId: "u2", from: "2026-11-01", to: "2026-11-30", fte: 0.5, version: 0 },
      { id: "c2", userId: "u2", from: "2026-12-01", to: null, fte: 0.8, version: 0 },
    ]
    stubFetch([
      { match: /\/plan\/member-load\?/, method: "GET", respond: () => jsonResponse({ members: [], canViewOthers: false, canManageAllocations: false, viewerId: "u2" }) },
      { match: "/api/users/u2/capacity", method: "GET", respond: () => jsonResponse({ capacities: rows }) },
      {
        match: /\/api\/users\/u2\/capacity\/c\d/,
        method: "DELETE",
        respond: (url: string) => {
          rows = rows.filter((r) => !url.endsWith(r.id))
          return jsonResponse({ deleted: true })
        },
      },
    ])
    renderWithProviders(<CapacityPage />)
    const buttons = await screen.findAllByRole("button", { name: new RegExp(t.pcpRemove) })
    expect(buttons).toHaveLength(2)
    await user.click(buttons[0])
    await waitFor(() => expect(screen.getAllByRole("button", { name: new RegExp(t.pcpRemove) })).toHaveLength(1))
    await waitFor(() => expect(screen.getByRole("button", { name: new RegExp(t.pcpRemove) })).toHaveFocus())
    await user.click(screen.getByRole("button", { name: new RegExp(t.pcpRemove) }))
    await waitFor(() => expect(screen.getByRole("heading", { name: t.pcpOwnTitle })).toHaveFocus())
  })
})
