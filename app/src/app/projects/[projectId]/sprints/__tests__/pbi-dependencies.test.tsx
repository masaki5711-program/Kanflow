import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import { pb, renderWithProviders, sprint, stubFetch, task, type Routes } from "./helpers"
import { resetNavigation, setSearch } from "./nav-mock"

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1", role: "admin" } } }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/pbi-detail-modal", () => ({ default: () => null }))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const ref = (id: string, displayId: number, status: string) => ({
  dependencyId: `d-${id}`, id, displayId, initiative: null, userStory: null, status, i18n: {},
})
// #12 (listed first) waits for #7, which the team had listed second.
const login = { ...pb("pb1", { displayId: 12, initiative: "Login page" }), blockedBy: [ref("pb2", 7, "ready")], blocking: [] }
const exportPbi = { ...pb("pb2", { displayId: 7, initiative: "Export" }), blockedBy: [], blocking: [ref("pb1", 12, "ready")] }

function routes(): Routes {
  return {
    [`${BASE}/sprints`]: [sprint("s1", { items: [task("t1", login), task("t2", exportPbi)] })],
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: [],
    [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
  }
}

beforeEach(() => resetNavigation())
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("sprint PBI dependencies", () => {
  it("list: the PBI that others wait for comes first, and each card says what it waits for", async () => {
    stubFetch(routes())
    renderWithProviders(<SprintsPage />)
    const waiting = await screen.findByRole("region", { name: "#12 Login page" })
    const prerequisite = screen.getByRole("region", { name: "#7 Export" })
    // #7 is ahead of #12 in the document.
    expect(prerequisite.compareDocumentPosition(waiting) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(waiting.querySelector("[data-pbi-waiting]")).not.toBeNull()
    expect(within(prerequisite).queryByText(/#12/)).not.toBeInTheDocument() // the "holds up" chip counts, it does not name
    expect(prerequisite.querySelector("[data-pbi-blocking]")).not.toBeNull()
  })

  it("board: a task of a waiting PBI shows the waiting chip", async () => {
    setSearch("view=board")
    stubFetch(routes())
    renderWithProviders(<SprintsPage />)
    const cards = await screen.findAllByRole("listitem", { name: /Task t/ })
    const waitingCards = cards.filter((c) => c.querySelector("[data-pbi-waiting]"))
    expect(waitingCards).toHaveLength(1)
    expect(waitingCards[0]).toHaveTextContent("Task t1")
  })
})
