import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import { forgetGitState } from "@/components/git-dev/git-client-state"
import { pb, renderWithProviders, sprint, stubFetch, t, task, type Routes } from "./helpers"
import { resetNavigation, setSearch } from "./nav-mock"

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1", role: "admin" } } }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/pbi-detail-modal", () => ({ default: () => null }))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const pb1 = pb("pb1", { displayId: 12, initiative: "Login page" })
const pb2 = pb("pb2", { displayId: 7, initiative: "Export" })
const CLAIMS_URL = `${BASE}/dev/claims?sprintId=s1`
const at = (ms: number) => new Date(Date.now() + ms).toISOString()

const claim = (id: string, over: object) => ({
  id, pbi: { id: "pb1", displayId: 12 }, task: null, user: { id: "u2", name: "Bea Ko" }, ai: true, branch: "feat/L4-PBI-12-login",
  startedAt: at(-3_600_000), heartbeatAt: at(-60_000), staleAt: at(3 * 3_600_000), stale: false, ...over,
})

function routes(): Routes {
  return {
    [`${BASE}/sprints`]: [sprint("s1", { items: [task("t1", pb1), task("t2", pb2, { status: "in_progress" }), task("t3", pb1)] })],
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: [],
    [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
    [`${BASE}/git/summary?pbiIds=${encodeURIComponent("pb1,pb2")}`]: { enabled: false, summaries: {} },
    [CLAIMS_URL]: {
      data: [
        claim("c1", { task: { id: "t2", name: "Task t2" }, pbi: { id: "pb2", displayId: 7 }, user: { id: "u3", name: "Cy Do" }, ai: false }),
        claim("c2", {}),
      ],
      staleAfterHours: 4,
      canModerate: false,
    },
  }
}

beforeEach(() => {
  forgetGitState()
  resetNavigation()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const card = (name: string, column: string) =>
  screen.getByRole("listitem", { name: t.sprintBoardCardLabel.replace("{name}", name).replace("{column}", column) })

describe("sprint board 担当中 marks", () => {
  it("one claims request for the whole sprint; each card shows its task's and its PBI's claims", async () => {
    setSearch("view=board")
    const { calls } = stubFetch(routes())
    renderWithProviders(<SprintsPage />)
    await screen.findByText("Task t1")
    await waitFor(() => expect(document.querySelectorAll("[data-claim-mark]").length).toBe(3))

    // Whole-PBI claim c2 (AI) on both cards of PBI #12; the task claim c1 (a person) only on t2.
    for (const name of ["Task t1", "Task t3"]) {
      const marks = within(card(name, t.taskTodo)).getAllByRole("listitem")
      expect(marks).toHaveLength(1)
      expect(marks[0].querySelector("[data-claim-ai]")).not.toBeNull()
    }
    const t2 = within(card("Task t2", t.taskInProgress)).getAllByRole("listitem")
    expect(t2).toHaveLength(1)
    expect(t2[0].querySelector("[data-claim-ai]")).toBeNull()
    expect(calls.filter((c) => c.url.includes("/dev/claims"))).toEqual([{ method: "GET", url: CLAIMS_URL, body: undefined }])
  })
})
