import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import { pb, renderWithProviders, sprint, stubFetch, t, task } from "./helpers"

const session = vi.hoisted(() => ({ current: { user: { id: "u1", role: "member" } } as unknown }))

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.current }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const pb1 = pb("pb1")

function routes(role: string, sprints: unknown) {
  return {
    [`${BASE}/sprints`]: sprints,
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: [{ id: "m1", userId: "u1", role, user: { id: "u1", name: "Alice", email: "a@x" } }],
    [BASE]: { defaultCapacity: 10, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("SprintsPage permissions (authz policy: sprint.manage)", () => {
  it("hides sprint-management controls from developers but keeps task controls", async () => {
    stubFetch(routes("dev", [sprint("s1", { status: "active", items: [task("t1", pb1)] })]))
    renderWithProviders(<SprintsPage />)
    const card = (await screen.findAllByRole("article"))[0]
    expect(await within(card).findByRole("button", { name: t.sprintAddTaskShort })).toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: t.sprintMoveToStatus.replace("{status}", t.sprintStatusReview) })).not.toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: t.sprintMoveToStatus.replace("{status}", t.sprintStatusDone) })).not.toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: t.sprintAddPbi })).not.toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: t.sprintEditMenu })).not.toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: t.sprintDeleteNamed.replace("{name}", "Sprint s1") })).not.toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: `${t.sprintRemovePbi}: #1` })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.sprintCreate })).not.toBeInTheDocument()
  })

  it("shows the same controls to a scrum master", async () => {
    stubFetch(routes("sm", [sprint("s1", { status: "active", items: [task("t1", pb1)] })]))
    renderWithProviders(<SprintsPage />)
    const card = (await screen.findAllByRole("article"))[0]
    expect(await within(card).findByRole("button", { name: t.sprintMoveToStatus.replace("{status}", t.sprintStatusReview) })).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: t.sprintAddPbi })).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: t.sprintEditMenu })).toBeInTheDocument()
    expect(within(card).getByRole("button", { name: t.sprintDeleteNamed.replace("{name}", "Sprint s1") })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.sprintCreate })).toBeInTheDocument()
  })
})
