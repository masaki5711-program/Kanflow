import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import { HIGHLIGHT_ATTR } from "@/hooks/use-deep-link-highlight"
import { pb, renderWithProviders, sprint, stubFetch, t, task, type Routes } from "./helpers"
import { currentSearch, resetNavigation, setSearch } from "./nav-mock"

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1", role: "admin" } } }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/pbi-detail-modal", () => ({ default: () => null }))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const pb1 = pb("pb1")

function routes(sprints: unknown): Routes {
  return {
    [`${BASE}/sprints`]: sprints,
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: [{ id: "m1", userId: "u1", role: "dev", user: { id: "u1", name: "Alice", email: "a@x" } }],
    [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
  }
}

// s1 is active (expanded by default); s0 is done (collapsed by default); s9 is archived (hidden by default).
const SPRINTS = [
  sprint("s1", { items: [task("t1", pb1, { taskName: "Active task" })] }),
  sprint("s0", { status: "done", items: [task("t0", pb1, { taskName: "Old task" })] }),
  sprint("s9", { status: "archived", items: [task("t9", pb1, { taskName: "Archived task" })] }),
]

beforeEach(() => {
  resetNavigation()
  Element.prototype.scrollIntoView = vi.fn()
  const storage = new Map<string, string>()
  Object.defineProperty(window, "localStorage", {
    value: { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v) },
    configurable: true,
    writable: true,
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function expectHighlighted(id: string) {
  await waitFor(() => expect(document.getElementById(id)).toHaveFocus())
  expect(document.getElementById(id)).toHaveAttribute(HIGHLIGHT_ATTR)
}

describe("sprint page deep links", () => {
  it("?task= in a collapsed sprint expands it, focuses + highlights the row and drops the param", async () => {
    setSearch("task=t0")
    stubFetch(routes(SPRINTS))
    renderWithProviders(<SprintsPage />)
    await expectHighlighted("task-t0")
    expect(screen.getByText("Old task")).toBeInTheDocument()
    expect(currentSearch()).toBe("")
  })

  it("?task= in an archived sprint reveals the archived list", async () => {
    setSearch("task=t9")
    stubFetch(routes(SPRINTS))
    renderWithProviders(<SprintsPage />)
    await expectHighlighted("task-t9")
  })

  it("?task= works on the board view and keeps the other params", async () => {
    setSearch("view=board&task=t1")
    stubFetch(routes(SPRINTS))
    renderWithProviders(<SprintsPage />)
    await expectHighlighted("task-t1")
    expect(document.getElementById("task-t1")).toHaveAttribute("data-board-card", "t1")
    expect(currentSearch()).toBe("view=board")
  })

  it("?task= clears filters that hide the task", async () => {
    setSearch("q=nomatch&task=t1")
    stubFetch(routes(SPRINTS))
    renderWithProviders(<SprintsPage />)
    await expectHighlighted("task-t1")
    expect(currentSearch()).toBe("")
  })

  it("an unknown ?task= shows a toast and drops the param", async () => {
    setSearch("task=gone")
    stubFetch(routes(SPRINTS))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByText(t.sprintDeepLinkTaskNotFound)).toBeInTheDocument()
    expect(currentSearch()).toBe("")
  })

  it("?sprint= expands and focuses that sprint card", async () => {
    setSearch("sprint=s0")
    stubFetch(routes(SPRINTS))
    renderWithProviders(<SprintsPage />)
    await expectHighlighted("sprint-card-s0")
    expect(screen.getByText("Old task")).toBeInTheDocument()
    expect(currentSearch()).toBe("")
  })

  it("an unknown ?sprint= shows a toast", async () => {
    setSearch("sprint=nope")
    stubFetch(routes(SPRINTS))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findByText(t.sprintDeepLinkSprintNotFound)).toBeInTheDocument()
    expect(currentSearch()).toBe("")
  })
})
