import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"

const nav = vi.hoisted(() => ({ run: null as string | null, replace: vi.fn(), push: vi.fn() }))
vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p1" }),
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => ({ get: (k: string) => (k === "run" ? nav.run : null) }),
}))
vi.mock("@/components/app-shell/project-title-context", () => ({ useProjectDocumentTitle: () => undefined }))

const EstimatePage = (await import("../page")).default
const t = tr("ja")

const SUMMARY = {
  gateOn: false,
  gateReason: "not_enough_actuals",
  templateEnd: "2026-11-20",
  p50End: "2026-11-20",
  p80End: "2026-11-20",
  bufferDays: 0,
  plannedEnd: "2026-11-24",
  leafCount: 2,
  rulesApplied: 0,
  rulesRejected: 0,
  matchedProjects: null,
  changes: [],
  changesTotal: 0,
}
const TEMPLATES = { match: "/api/plan-templates", method: "GET", respond: () => jsonResponse([{ id: "t1", name: "設備導入（合成）" }]) }

afterEach(() => {
  vi.unstubAllGlobals()
  nav.run = null
  nav.replace.mockReset()
  nav.push.mockReset()
})

describe("計画を作る page (plan 12 E5)", () => {
  it("the form names each missing field, then makes a run and opens it", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      TEMPLATES,
      { match: "/api/plan-templates/t1", method: "GET", respond: () => jsonResponse({ id: "t1", name: "設備導入（合成）", content: { stages: [{ name: "据付" }] } }) },
      { match: "/api/projects/p1/plan/estimate-runs", method: "POST", respond: () => jsonResponse({ runId: "r9", summary: SUMMARY }, 201) },
    ])
    renderWithProviders(<EstimatePage />)
    await user.click(await screen.findByRole("button", { name: t.pesCreate }))
    expect(screen.getByText(t.pesErrTemplate)).toBeInTheDocument()
    expect(screen.getByText(t.pesErrStart)).toBeInTheDocument()
    await user.selectOptions(await screen.findByLabelText(new RegExp(t.pesFieldTemplate)), "t1")
    expect(await screen.findByText(t.pesNoRoles)).toBeInTheDocument()
    await user.type(screen.getByLabelText(new RegExp(t.pesFieldStart)), "2026-11-09")
    await user.click(screen.getByRole("button", { name: t.pesCreate }))
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/projects/p1/plan/estimate?run=r9"))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ templateId: "t1", startDate: "2026-11-09", skipWeekends: true, roleAssignments: {} })
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/members"))).toBe(false)
  })

  const ROLE_TEMPLATES = { match: "/api/plan-templates", method: "GET", respond: () => jsonResponse([{ id: "t2", name: "役割つき（合成）" }, { id: "t3", name: "別の役割（合成）" }]) }
  const detailOf = (id: string, role: string) => ({ match: `/api/plan-templates/${id}`, method: "GET", respond: () => jsonResponse({ id, name: id, content: { stages: [{ name: "作業", role }] } }) })
  const MEMBERS = { match: "/api/projects/p1/members", method: "GET", respond: () => jsonResponse([{ userId: "u1", role: "po", user: { name: "合成 太郎" } }]) }

  it("a choice never travels to another template (its roles are other roles)", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([ROLE_TEMPLATES, detailOf("t2", "design"), detailOf("t3", "build"), MEMBERS, { match: "/api/projects/p1/plan/estimate-runs", method: "POST", respond: () => jsonResponse({ runId: "r11", summary: SUMMARY }, 201) }])
    renderWithProviders(<EstimatePage />)
    const select = await screen.findByLabelText(new RegExp(t.pesFieldTemplate))
    await user.selectOptions(select, "t2")
    await user.click(within(await screen.findByRole("group", { name: new RegExp(t.pesRoleMembers.replace("{role}", "design")) })).getByRole("checkbox", { name: "合成 太郎" }))
    await user.selectOptions(select, "t3")
    const build = await screen.findByRole("group", { name: new RegExp(t.pesRoleMembers.replace("{role}", "build")) })
    expect(within(build).getByRole("checkbox", { name: "合成 太郎" })).not.toBeChecked()
    await user.type(screen.getByLabelText(new RegExp(t.pesFieldStart)), "2026-11-09")
    await user.click(screen.getByRole("button", { name: t.pesCreate }))
    await waitFor(() => expect(nav.replace).toHaveBeenCalled())
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body)).roleAssignments).toEqual({})
  })

  it("a failed load of the members says so, makes no run meanwhile, and retries", async () => {
    const user = userEvent.setup()
    let fail = true
    const fetchMock = stubFetch([
      ROLE_TEMPLATES,
      detailOf("t2", "design"),
      { match: "/api/projects/p1/members", method: "GET", respond: () => (fail ? jsonResponse({ error: "x" }, 500) : jsonResponse([{ userId: "u1", role: "po", user: { name: "合成 太郎" } }])) },
      { match: "/api/projects/p1/plan/estimate-runs", method: "POST", respond: () => jsonResponse({ runId: "r12", summary: SUMMARY }, 201) },
    ])
    renderWithProviders(<EstimatePage />)
    await user.selectOptions(await screen.findByLabelText(new RegExp(t.pesFieldTemplate)), "t2")
    expect(await screen.findByText(t.pesRolesFailed)).toBeInTheDocument()
    await user.type(screen.getByLabelText(new RegExp(t.pesFieldStart)), "2026-11-09")
    await user.click(screen.getByRole("button", { name: t.pesCreate }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)
    fail = false
    await user.click(screen.getByRole("button", { name: t.errorRetry }))
    expect(await screen.findByRole("group", { name: new RegExp(t.pesRoleMembers.replace("{role}", "design")) })).toBeInTheDocument()
  })

  it("a project without members says what to do", async () => {
    const user = userEvent.setup()
    stubFetch([ROLE_TEMPLATES, detailOf("t2", "design"), { match: "/api/projects/p1/members", method: "GET", respond: () => jsonResponse([]) }])
    renderWithProviders(<EstimatePage />)
    await user.selectOptions(await screen.findByLabelText(new RegExp(t.pesFieldTemplate)), "t2")
    expect(await screen.findByText(t.pesRoleNoMembers)).toBeInTheDocument()
  })

  it("asks for the members of each role of the template and sends them with the run", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: "/api/plan-templates", method: "GET", respond: () => jsonResponse([{ id: "t2", name: "役割つき（合成）" }]) },
      {
        match: "/api/plan-templates/t2",
        method: "GET",
        respond: () =>
          jsonResponse({
            id: "t2",
            name: "役割つき（合成）",
            content: { stages: [{ name: "設計", children: [{ name: "基本設計", role: "design" }, { name: "詳細設計", role: "design" }] }, { name: "製作", role: "build" }, { name: "親の役割は数えない", role: "ignored", children: [{ name: "子" }] }] },
          }),
      },
      {
        match: "/api/projects/p1/members",
        method: "GET",
        respond: () => jsonResponse([{ userId: "u1", role: "po", user: { name: "合成 太郎" } }, { userId: "u2", role: "dev", user: { name: "合成 花子" } }]),
      },
      { match: "/api/projects/p1/plan/estimate-runs", method: "POST", respond: () => jsonResponse({ runId: "r10", summary: SUMMARY }, 201) },
    ])
    renderWithProviders(<EstimatePage />)
    await user.selectOptions(await screen.findByLabelText(new RegExp(t.pesFieldTemplate)), "t2")
    const design = await screen.findByRole("group", { name: new RegExp(t.pesRoleMembers.replace("{role}", "design")) })
    const build = screen.getByRole("group", { name: new RegExp(t.pesRoleMembers.replace("{role}", "build")) })
    expect(screen.queryByRole("group", { name: new RegExp(t.pesRoleMembers.replace("{role}", "ignored")) })).toBeNull()
    await user.click(within(design).getByRole("checkbox", { name: "合成 花子" }))
    await user.click(within(build).getByRole("checkbox", { name: "合成 太郎" }))
    await user.click(within(build).getByRole("checkbox", { name: "合成 花子" }))
    await user.click(within(build).getByRole("checkbox", { name: "合成 太郎" }))
    await user.type(screen.getByLabelText(new RegExp(t.pesFieldStart)), "2026-11-09")
    await user.click(screen.getByRole("button", { name: t.pesCreate }))
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/projects/p1/plan/estimate?run=r10"))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body)).roleAssignments).toEqual({ design: ["u2"], build: ["u2"] })
  })

  it("shows the card of ?run=, says why the template's days are kept, and hides owners without the right", async () => {
    nav.run = "r1"
    stubFetch([TEMPLATES, { match: "/api/projects/p1/plan/estimate-runs/r1", method: "GET", respond: () => jsonResponse({ runId: "r1", summary: SUMMARY, createdAt: "2026-11-04T00:00:00Z", expiresAt: "2026-11-05T00:00:00Z", expired: false, stale: false, changesWithheld: 0 }) }])
    renderWithProviders(<EstimatePage />)
    expect(await screen.findByRole("heading", { name: t.pesCardTitle })).toBeInTheDocument()
    expect(screen.getByText(new RegExp(t.pesGateReason_not_enough_actuals))).toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: t.pesOwnersTitle })).not.toBeInTheDocument()
    // Says why no owners are shown and what loading from here does.
    expect(screen.getByText(t.pesOwnersNotShown)).toBeInTheDocument()
  })

  it("owners can only be removed; loading sends the run id and the removed keys, nothing else", async () => {
    nav.run = "r1"
    const user = userEvent.setup()
    const card = {
      runId: "r1",
      summary: { ...SUMMARY, changes: [{ key: "build", name: "製作", templateDays: 10, days: 12 }] },
      createdAt: "2026-11-04T00:00:00Z",
      expiresAt: "2026-11-05T00:00:00Z",
      expired: false,
      stale: false,
      changesWithheld: 0,
      ownerPlan: { owners: { build: "u2" }, names: { build: "製作" }, before: [{ userId: "u2", name: "開発2", maxUtilization: 2, daysOverCapacity: 3 }], after: [{ userId: "u2", name: "開発2", maxUtilization: 1, daysOverCapacity: 0 }] },
    }
    const fetchMock = stubFetch([
      TEMPLATES,
      { match: "/api/projects/p1/plan/estimate-runs/r1", method: "GET", respond: () => jsonResponse(card) },
      { match: "/api/projects/p1/plan/load", method: "POST", respond: () => jsonResponse({ createdCount: 1 }, 201) },
    ])
    renderWithProviders(<EstimatePage />)
    // The button's name starts with its visible text (外す), and flips to 戻す once pressed.
    await user.click(await screen.findByRole("button", { name: new RegExp(`^${t.pesOwnerRemove}.*製作`) }))
    expect(screen.getByRole("button", { name: new RegExp(`^${t.pesOwnerRestore}.*製作`) })).toBeInTheDocument()
    expect(screen.getByText(t.pesOwnerWillBeRemoved)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.pesLoad }))
    await waitFor(() => expect(nav.push).toHaveBeenCalledWith("/projects/p1/plan"))
    const post = fetchMock.mock.calls.find(([url, init]) => String(url).includes("/plan/load") && init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ estimateRunId: "r1", removedOwnerKeys: ["build"] })
  })

  it("an expired or stale run cannot be loaded and says so", async () => {
    nav.run = "r1"
    const fetchMock = stubFetch([TEMPLATES, { match: "/api/projects/p1/plan/estimate-runs/r1", method: "GET", respond: () => jsonResponse({ runId: "r1", summary: SUMMARY, createdAt: "x", expiresAt: "2026-11-05T00:00:00Z", expired: false, stale: true, changesWithheld: 0 }) }])
    renderWithProviders(<EstimatePage />)
    expect(await screen.findByText(t.pesStale)).toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole("button", { name: t.pesLoad }))
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/plan/load"))).toBe(false)
  })
})
