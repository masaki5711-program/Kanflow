import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { ActualsResponse, SnapshotView } from "@/components/plan-actuals/types"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock("@/components/app-shell/project-title-context", () => ({ useProjectDocumentTitle: () => undefined }))

const ActualsPage = (await import("../page")).default
const t = tr("ja")
const URL_BASE = "/api/projects/p1/plan/actuals"

const snap = (over: Partial<SnapshotView> = {}): SnapshotView => ({
  id: "s1",
  lineage: "template:t1",
  closedAt: "2026-11-16",
  firstFinalizedAt: "2026-11-20T00:00:00.000Z",
  finalizedAt: "2026-11-20T00:00:00.000Z",
  repoCount: 3,
  issueCount: 0,
  includeInLearning: true,
  current: true,
  version: 0,
  leafCount: 3,
  completeCount: 2,
  ...over,
})

function body(over: Partial<ActualsResponse> = {}): ActualsResponse {
  return {
    preview: { leafCount: 3, completeCount: 2, repoCount: 3, issues: [{ kind: "missing_actual", planItemId: "a", name: "検収" }, { kind: "repository_unreadable", repositoryRef: "g/r2" }] },
    snapshots: [],
    permissions: { finalize: true },
    ...over,
  }
}

const attributesRoute = { match: "/api/projects/p1/attributes", method: "GET", respond: () => jsonResponse({ attributes: [], canEdit: false }) }

afterEach(() => vi.unstubAllGlobals())

describe("actuals page (plan 12 E1)", () => {
  it("shows what would be frozen and the items to check, by name", async () => {
    stubFetch([{ match: URL_BASE, method: "GET", respond: () => jsonResponse(body()) }, attributesRoute])
    renderWithProviders(<ActualsPage />)
    expect(await screen.findByText(`検収 — ${t.pacIssueMissingActual}`)).toBeInTheDocument()
    expect(screen.getByText(`g/r2 — ${t.pacIssueRepoUnreadable}`)).toBeInTheDocument()
    expect(screen.getByText(t.pacIssuesNote)).toBeInTheDocument()
  })

  it("finalizing with open issues warns with their count and sends acknowledgeIssues", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(body()) },
      { match: URL_BASE, method: "POST", respond: () => jsonResponse(snap(), 201) },
      attributesRoute,
    ])
    renderWithProviders(<ActualsPage />)
    await user.click(await screen.findByRole("button", { name: t.pacFinalize }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(new RegExp(t.pacFinalizeWithIssues.replace("{n}", "2").replace("?", "\\?")))).toBeInTheDocument()
    await user.click(within(dialog).getByRole("button", { name: t.pacFinalizeAction }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(true))
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")
    // The number of issues the user was shown — the server refuses if it changed meanwhile.
    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ acknowledgedIssueCount: 2 })
  })

  it("the learning switch needs a reason and sends it with the version", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(body({ snapshots: [snap({ version: 4 })] })) },
      { match: `${URL_BASE}/s1`, method: "PATCH", respond: () => jsonResponse(snap({ includeInLearning: false, version: 5 })) },
      attributesRoute,
    ])
    renderWithProviders(<ActualsPage />)
    await user.click(await screen.findByRole("button", { name: t.pacLearningTurnOff }))
    const dialog = await screen.findByRole("dialog")
    await user.click(within(dialog).getByRole("button", { name: t.pacLearningTurnOff }))
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(false)
    // The error says what is missing (not just the label) and focus goes to the field.
    expect(within(dialog).getByText(t.pacLearningReasonRequired)).toBeInTheDocument()
    await waitFor(() => expect(within(dialog).getByLabelText(new RegExp(t.pacLearningReason))).toHaveFocus())
    await user.type(within(dialog).getByLabelText(new RegExp(t.pacLearningReason)), "進め方が特殊")
    await user.click(within(dialog).getByRole("button", { name: t.pacLearningTurnOff }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true))
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ includeInLearning: false, reason: "進め方が特殊", version: 4 })
  })

  it("a developer sees the actuals but cannot finalize or switch learning", async () => {
    stubFetch([{ match: URL_BASE, method: "GET", respond: () => jsonResponse(body({ snapshots: [snap()], permissions: { finalize: false } })) }, attributesRoute])
    renderWithProviders(<ActualsPage />)
    await screen.findByText(t.pacSnapshotsTitle)
    expect(screen.queryByRole("button", { name: t.pacFinalizeAgain })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.pacLearningTurnOff })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.pacItemsShow })).toBeInTheDocument()
  })
})
