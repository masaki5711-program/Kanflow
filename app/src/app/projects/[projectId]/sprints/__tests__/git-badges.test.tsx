import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
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
const SUMMARY_URL = `${BASE}/git/summary?pbiIds=${encodeURIComponent("pb1,pb2")}`
const BADGE = "マージリクエスト 1 件オープン、パイプライン: 失敗"

function routes(summary: unknown): Routes {
  return {
    [`${BASE}/sprints`]: [sprint("s1", { items: [task("t1", pb1), task("t2", pb2, { status: "in_progress" }), task("t3", pb1, { status: "done" })] })],
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: [],
    [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
    [SUMMARY_URL]: summary,
  }
}

const ON = { enabled: true, summaries: { pb1: { openMrs: 1, mergedMrs: 0, branches: 1, pipeline: "failed" } } }

beforeEach(() => {
  forgetGitState()
  resetNavigation()
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const summaryCalls = (calls: Array<{ url: string }>) => calls.filter((c) => c.url.includes("/git/summary"))

describe("sprint Git badges", () => {
  it("board: one summary request for the sprint's PBIs; every card of a linked PBI shows the badge", async () => {
    setSearch("view=board")
    const { calls } = stubFetch(routes(ON))
    renderWithProviders(<SprintsPage />)
    expect(await screen.findAllByText(BADGE)).toHaveLength(2)
    const exportCard = screen.getByRole("listitem", { name: t.sprintBoardCardLabel.replace("{name}", "Task t2").replace("{column}", t.taskInProgress) })
    expect(within(exportCard).queryByText(BADGE)).not.toBeInTheDocument()
    expect(summaryCalls(calls)).toHaveLength(1)
  })

  it("list: the PBI group header shows the badge", async () => {
    stubFetch(routes(ON))
    renderWithProviders(<SprintsPage />)
    const group = await screen.findByRole("region", { name: "#12 Login page" })
    expect(await within(group).findAllByText(BADGE)).not.toHaveLength(0)
  })

  it("nothing Git-related renders when the integration is off", async () => {
    setSearch("view=board")
    const { calls } = stubFetch(routes({ enabled: false, summaries: {} }))
    renderWithProviders(<SprintsPage />)
    await screen.findByText("Task t1")
    await vi.waitFor(() => expect(summaryCalls(calls)).toHaveLength(1))
    expect(document.querySelector("[data-git-badge]")).toBeNull()
  })
})
