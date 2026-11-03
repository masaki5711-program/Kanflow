import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { LessonRuleView, ProjectLessonRulesResponse } from "@/components/plan-lesson-rules/types"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/app-shell/project-title-context", () => ({ useProjectDocumentTitle: () => undefined }))

const LessonRulesPage = (await import("../page")).default
const t = tr("ja")
const URL_BASE = "/api/projects/p1/plan/lesson-rules"

function rule(over: Partial<LessonRuleView> & { id: string }): LessonRuleView {
  return {
    kind: "add_buffer",
    params: { afterKey: "accept", days: 3 },
    scope: "project",
    lineage: null,
    projectType: null,
    state: "draft",
    quote: null,
    fromRetrospective: false,
    createdByKind: "human",
    confirmedAt: null,
    promotionRequest: null,
    version: 0,
    sourceConfidential: false,
    suspended: false,
    ...over,
  }
}

function page(rules: LessonRuleView[], permissions = { draft: true, confirm: true, requestPromotion: true }): ProjectLessonRulesResponse {
  return { rules, permissions, projectType: "software", lineages: ["template:t1"], sprints: [{ id: "s1", name: "Sprint 1" }] }
}

afterEach(() => vi.unstubAllGlobals())

describe("lesson rules page (plan 12 E3)", () => {
  it("shows drafts with the sentence and its numbers, grouped by state", async () => {
    stubFetch([{ match: URL_BASE, method: "GET", respond: () => jsonResponse(page([rule({ id: "r1" }), rule({ id: "r2", state: "confirmed", kind: "split", params: { key: "impl", parts: 3 } })])) }])
    renderWithProviders(<LessonRulesPage />)
    expect(await screen.findByRole("heading", { name: "「accept」の後に 3 日の余裕を入れる" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { name: "「impl」を 3 つに分ける" })).toBeInTheDocument()
    expect(screen.getByRole("heading", { level: 2, name: new RegExp(t.plrSectionDraft.replace(/[()（）]/g, ".")) })).toBeInTheDocument()
  })

  it("confirm shows the numbers in the dialog and sends the same kind, params and version", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(page([rule({ id: "r1", version: 2 })])) },
      { match: `${URL_BASE}/r1/confirm`, method: "POST", respond: () => jsonResponse(rule({ id: "r1", state: "confirmed" })) },
    ])
    renderWithProviders(<LessonRulesPage />)
    await user.click(await screen.findByRole("button", { name: t.plrConfirm }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(/「accept」の後に 3 日の余裕を入れる/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: t.plrConfirmAction }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/r1/confirm"))).toBe(true))
    const call = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/r1/confirm"))
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ version: 2, kind: "add_buffer", params: { afterKey: "accept", days: 3 } })
  })

  it("after confirming, focus lands on the rule's heading in its new section (not on <body>)", async () => {
    const user = userEvent.setup()
    let confirmed = false
    stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(page([rule({ id: "r1", state: confirmed ? "confirmed" : "draft" })])) },
      { match: `${URL_BASE}/r1/confirm`, method: "POST", respond: () => ((confirmed = true), jsonResponse(rule({ id: "r1", state: "confirmed" }))) },
    ])
    renderWithProviders(<LessonRulesPage />)
    await user.click(await screen.findByRole("button", { name: t.plrConfirm }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.plrConfirmAction }))
    await screen.findByRole("heading", { level: 2, name: new RegExp(t.plrSectionConfirmed) })
    await waitFor(() => expect(document.activeElement?.id).toBe("plr-rule-r1"))
  })

  it("a failed save keeps the editor open and focus inside it", async () => {
    const user = userEvent.setup()
    stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(page([rule({ id: "r1" })])) },
      { match: `${URL_BASE}/r1`, method: "PATCH", respond: () => jsonResponse({ error: "x", code: "PLAN_RULE_CHANGED" }, 409) },
    ])
    renderWithProviders(<LessonRulesPage />)
    await user.click(await screen.findByRole("button", { name: t.plrEdit }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: t.plrSaveDraft }))
    expect(await screen.findByText(t.apiErrPlanRuleChanged)).toBeInTheDocument()
    // Give a (wrong) focus move a chance to happen, then check it did not leave the dialog.
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.getByRole("dialog")).toBeInTheDocument()
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true)
  })

  it("a developer (no permissions) sees the rules but no actions", async () => {
    stubFetch([{ match: URL_BASE, method: "GET", respond: () => jsonResponse(page([rule({ id: "r1" })], { draft: false, confirm: false, requestPromotion: false })) }])
    renderWithProviders(<LessonRulesPage />)
    await screen.findByRole("heading", { name: "「accept」の後に 3 日の余裕を入れる" })
    expect(screen.queryByRole("button", { name: t.plrConfirm })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.plrNew })).not.toBeInTheDocument()
  })

  it("a retrospective rule offers no sharing and says why", async () => {
    stubFetch([{ match: URL_BASE, method: "GET", respond: () => jsonResponse(page([rule({ id: "r1", state: "confirmed", fromRetrospective: true })])) }])
    renderWithProviders(<LessonRulesPage />)
    expect(await screen.findByText(t.plrPromotionBlockedRetro)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.plrRequestPromotion })).not.toBeInTheDocument()
  })

  it("a rule changed meanwhile: the 409 is shown in the user's language and the list reloads", async () => {
    const user = userEvent.setup()
    let gets = 0
    stubFetch([
      { match: URL_BASE, method: "GET", respond: () => (gets++, jsonResponse(page([rule({ id: "r1" })]))) },
      { match: `${URL_BASE}/r1/confirm`, method: "POST", respond: () => jsonResponse({ error: "x", code: "PLAN_RULE_CHANGED" }, 409) },
    ])
    renderWithProviders(<LessonRulesPage />)
    await user.click(await screen.findByRole("button", { name: t.plrConfirm }))
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.plrConfirmAction }))
    expect(await screen.findByText(t.apiErrPlanRuleChanged)).toBeInTheDocument()
    await waitFor(() => expect(gets).toBeGreaterThanOrEqual(2))
  })

  it("writes a new draft from the editor; an out-of-range number is caught before sending", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(page([])) },
      { match: URL_BASE, method: "POST", respond: () => jsonResponse(rule({ id: "r9" }), 201) },
    ])
    renderWithProviders(<LessonRulesPage />, { language: "en" })
    const en = tr("en")
    await user.click((await screen.findAllByRole("button", { name: en.plrNew }))[0])
    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(new RegExp(en.plrFieldAfterKey)), "accept")
    await user.type(within(dialog).getByLabelText(new RegExp(en.plrFieldDays.replace(/[()]/g, "."))), "45")
    await user.click(within(dialog).getByRole("button", { name: en.plrSaveDraft }))
    expect(within(dialog).getByText(en.plrFieldInvalid)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false)

    const days = within(dialog).getByLabelText(new RegExp(en.plrFieldDays.replace(/[()]/g, ".")))
    await user.clear(days)
    await user.type(days, "4")
    expect(within(dialog).getByText("Add a 4-day buffer after “accept”")).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: en.plrSaveDraft }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ kind: "add_buffer", params: { afterKey: "accept", days: 4 }, quote: null })
  })
})
