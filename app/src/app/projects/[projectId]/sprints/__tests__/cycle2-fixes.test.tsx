import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { fillTemplate } from "@/lib/fill-template"
import { deferred, json, pb, renderWithProviders, sprint, stubFetch, t, task, type Routes } from "./helpers"
import { initialForm, seedUntouched } from "../components/sprint-create-form"

vi.mock("next/navigation", async () => (await import("./nav-mock")).navigationMock)
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1", role: "admin" } } }) }))
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))
vi.mock("@/components/pbi-detail-modal", () => ({ default: () => null }))

const { default: SprintsPage } = await import("../page")

const BASE = "/api/projects/p1"
const PROJECT = { defaultCapacity: 12, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null }
const SETTINGS = { defaultCapacity: 12, sprintDurationDays: 14, pointUnit: "SP", pointDescription: null }

function routes(sprints: unknown, project: unknown = PROJECT, extra: Routes = {}): Routes {
  return {
    [`${BASE}/sprints`]: sprints,
    [`${BASE}/backlog?status=ready`]: { readyItems: [] },
    [`${BASE}/events`]: [],
    [`${BASE}/members`]: [{ id: "m1", userId: "u1", role: "po", user: { id: "u1", name: "Alice", email: "a@x" } }],
    [BASE]: project,
    ...extra,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("S-16: create-sprint waits for the project defaults", () => {
  it("keeps スプリント作成 disabled until the project loads, then seeds dates and capacity", async () => {
    const project = deferred<Response>()
    stubFetch(routes([], () => project.promise))
    renderWithProviders(<SprintsPage />)
    await screen.findByText(t.sprintNoSprints)
    for (const button of screen.getAllByRole("button", { name: t.sprintCreate })) expect(button).toBeDisabled()

    project.resolve(json(PROJECT))
    await waitFor(() => expect(screen.getAllByRole("button", { name: t.sprintCreate })[0]).toBeEnabled())
    await userEvent.click(screen.getAllByRole("button", { name: t.sprintCreate })[0])
    const form = screen.getByRole("region", { name: t.sprintNewSprint })
    expect(within(form).getByRole("spinbutton")).toHaveValue(12)
    const [start, end] = form.querySelectorAll<HTMLInputElement>("input[type=date]")
    expect(start.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(end.value).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it("hides the empty state while the create form is open (S-15c)", async () => {
    stubFetch(routes([]))
    renderWithProviders(<SprintsPage />)
    await screen.findByText(t.sprintNoSprints)
    await waitFor(() => expect(screen.getAllByRole("button", { name: t.sprintCreate })[0]).toBeEnabled())
    await userEvent.click(screen.getAllByRole("button", { name: t.sprintCreate })[0])
    expect(screen.getByText(t.sprintNewSprint)).toBeInTheDocument()
    expect(screen.queryByText(t.sprintNoSprints)).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.cancel }))
    expect(screen.getByText(t.sprintNoSprints)).toBeInTheDocument()
  })
})

describe("seedUntouched (S-16)", () => {
  const today = new Date(2026, 8, 30, 10)

  it("fills empty defaults once the settings arrive", () => {
    const empty = initialForm(null, today)
    expect(empty).toMatchObject({ startDate: "", endDate: "", capacity: 0 })
    expect(seedUntouched(empty, SETTINGS, new Set(), today)).toMatchObject({ startDate: "2026-09-30", endDate: "2026-10-14", capacity: 12 })
  })

  it("keeps the fields the user already edited", () => {
    const edited = { ...initialForm(null, today), sprintName: "S", capacity: 0, startDate: "2026-10-01" }
    expect(seedUntouched(edited, SETTINGS, new Set(["capacity", "startDate"] as const), today))
      .toEqual({ sprintName: "S", sprintGoal: "", capacity: 0, startDate: "2026-10-01", endDate: "2026-10-14" })
  })
})

describe("PBI group labels (S-15b / S-20)", () => {
  it("shows task counts and task hours with their own units, and an add-task button without a literal +", async () => {
    const pb1 = pb("pb1", { workloadScore: 3 })
    const s1 = sprint("s1", {
      items: [
        task("t1", pb1, { status: "done", estimatedHours: 4 }),
        task("t2", pb1, { estimatedHours: 8 }),
        task("t3", pb1),
      ],
    })
    stubFetch(routes([s1]))
    renderWithProviders(<SprintsPage />)
    const group = await screen.findByRole("region", { name: /^#1 / })
    expect(within(group).getByText(fillTemplate(t.sprintPbiTaskSummary, { done: 1, total: 3, hours: 12 }))).toBeInTheDocument()
    expect(within(group).getByText("33%")).toBeInTheDocument()
    expect(group).not.toHaveTextContent(/12 \/ 3/)
    const add = within(group).getByRole("button", { name: t.sprintAddTaskShort })
    expect(add.textContent?.trim().startsWith("+")).toBe(false)
    expect(t.sprintAddTaskShort).not.toMatch(/\+/)
  })

  it("folds the task list yet keeps the remaining count and names visible", async () => {
    const pb1 = pb("pb1", { workloadScore: 3 })
    const s1 = sprint("s1", {
      items: [
        task("t1", pb1, { status: "done", taskName: "完了タスク" }),
        task("t2", pb1, { taskName: "残りタスクA" }),
      ],
    })
    stubFetch(routes([s1]))
    renderWithProviders(<SprintsPage />)
    const group = await screen.findByRole("region", { name: /^#1 / })
    expect(within(group).getByText(fillTemplate(t.sprintPbiRemaining, { n: 1 }))).toBeInTheDocument()
    await userEvent.click(within(group).getByRole("button", { name: new RegExp(`^${t.sprintPbiCollapse}`) }))
    const toggle = within(group).getByRole("button", { name: new RegExp(`^${t.sprintPbiExpand}`) })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(within(group).queryByText("完了タスク")).not.toBeVisible()
    // The name also sits in the hidden task row; the folded preview is the visible one.
    expect(within(group).getAllByText(/残りタスクA/).filter((el) => !el.closest("[hidden]"))).toHaveLength(1)
    expect(within(group).getByText(fillTemplate(t.sprintPbiRemaining, { n: 1 }))).toBeInTheDocument()
  })
})
