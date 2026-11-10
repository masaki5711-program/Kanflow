import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import type { ActualsResponse, ReviewListView, ReviewProposalView, SnapshotView } from "@/components/plan-actuals/types"

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

describe("AI review proposals on the actuals page", () => {
  const proposal = (over: Partial<ReviewProposalView> = {}): ReviewProposalView => ({
    id: "x1",
    hidden: false,
    snapshotItemId: "i1",
    itemName: "検査",
    plannedDays: 5,
    actualDays: 12,
    kind: "treat_as_waiting",
    quote: "部品の入荷待ちで 1 週間止まった",
    quoteSource: "item",
    confidence: "high",
    state: "pending",
    version: 2,
    decidedAt: null,
    decidedByName: null,
    ...over,
  })
  const list = (proposals: ReviewProposalView[], job: ReviewListView["job"] = "done", over: Partial<ReviewListView> = {}): ReviewListView => ({ snapshotId: "s1", job, jobReason: null, capped: 0, proposals, ...over })
  const REVIEW = `${URL_BASE}/review`

  it("a PO / SM sees the pending proposal with its quoted reason and accepts it (with the version)", async () => {
    const user = userEvent.setup()
    let current = list([proposal(), proposal({ id: "x2", hidden: true, snapshotItemId: null, itemName: null, plannedDays: null, actualDays: null, kind: "exclude_from_learning", quote: null, quoteSource: null, confidence: "low" }), proposal({ id: "x3", snapshotItemId: "i3", itemName: "出荷", quote: "全体として遅れた", quoteSource: "note" })])
    const fetchMock = stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(body({ snapshots: [snap()], permissions: { finalize: true, review: true } })) },
      { match: REVIEW, method: "GET", respond: () => jsonResponse(current) },
      {
        match: `${REVIEW}/x1`,
        method: "PATCH",
        respond: () => {
          current = list([proposal({ state: "accepted", version: 3, decidedAt: "2026-11-10T01:00:00.000Z", decidedByName: "PO 太郎" })])
          return jsonResponse(current.proposals[0])
        },
      },
      attributesRoute,
    ])
    renderWithProviders(<ActualsPage />)
    const section = await screen.findByRole("region", { name: t.pacReviewTitle })
    expect(await within(section).findByText("部品の入荷待ちで 1 週間止まった")).toBeInTheDocument()
    expect(within(section).getAllByText(t.pacReviewKindWaiting).length).toBeGreaterThan(0)
    // A leaf with a confidential PBI: a placeholder without name or reason, which can only be declined.
    expect(within(section).getByText(t.pacReviewReasonHidden)).toBeInTheDocument()
    expect(within(section).getByRole("heading", { name: t.pacReviewHiddenItem })).toBeInTheDocument()
    expect(within(section).queryByRole("button", { name: t.pacReviewAcceptOf.replace("{name}", t.pacReviewHiddenItem) })).not.toBeInTheDocument()
    expect(within(section).getByRole("button", { name: t.pacReviewRejectOf.replace("{name}", t.pacReviewHiddenItem) })).toBeInTheDocument()
    // Where the quote is from.
    expect(within(section).getByText(t.pacReviewReasonFromNote)).toBeInTheDocument()
    await user.click(within(section).getByRole("button", { name: t.pacReviewAcceptOf.replace("{name}", "検査") }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true))
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ decision: "accept", version: 2 })
    // Accepted: who decided is shown, and it can be taken back.
    expect(await within(section).findByText(/PO 太郎/)).toBeInTheDocument()
    expect(within(section).getByRole("button", { name: t.pacReviewRejectOf.replace("{name}", "検査") })).toHaveTextContent(t.pacReviewUndoAccept)
    // Focus moves to the decided card's heading (its buttons changed).
    await waitFor(() => expect(within(section).getByRole("heading", { name: "検査" })).toHaveFocus())
  })

  it("rejecting sends reject; without proposals the job state is said", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(body({ snapshots: [snap()], permissions: { finalize: true, review: true } })) },
      { match: REVIEW, method: "GET", respond: () => jsonResponse(list([proposal()])) },
      { match: `${REVIEW}/x1`, method: "PATCH", respond: () => jsonResponse(proposal({ state: "rejected", version: 3 })) },
      attributesRoute,
    ])
    renderWithProviders(<ActualsPage />)
    await user.click(await screen.findByRole("button", { name: t.pacReviewRejectOf.replace("{name}", "検査") }))
    await waitFor(() => expect(fetchMock.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true))
    expect(JSON.parse(String(fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")?.[1]?.body))).toEqual({ decision: "reject", version: 2 })
  })

  it("a review skipped for the prompt size and proposals refused by the cap are said", async () => {
    stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(body({ snapshots: [snap()], permissions: { finalize: true, review: true } })) },
      { match: REVIEW, method: "GET", respond: () => jsonResponse(list([], "skipped", { jobReason: "prompt_budget", capped: 3 })) },
      attributesRoute,
    ])
    renderWithProviders(<ActualsPage />)
    expect(await screen.findByText(t.pacReviewJobSkippedBudget)).toBeInTheDocument()
    expect(screen.getByText(t.pacReviewCapped.replace("{n}", "3"))).toBeInTheDocument()
  })

  it("the job state is shown when there is nothing to decide", async () => {
    stubFetch([
      { match: URL_BASE, method: "GET", respond: () => jsonResponse(body({ snapshots: [snap()], permissions: { finalize: true, review: true } })) },
      { match: REVIEW, method: "GET", respond: () => jsonResponse(list([], "queued")) },
      attributesRoute,
    ])
    renderWithProviders(<ActualsPage />)
    expect(await screen.findByText(t.pacReviewJobQueued)).toBeInTheDocument()
  })

  it("a developer (no plan.actualsReview) sees no proposals and the list is not even requested", async () => {
    const fetchMock = stubFetch([{ match: URL_BASE, method: "GET", respond: () => jsonResponse(body({ snapshots: [snap()], permissions: { finalize: false, review: false } })) }, attributesRoute])
    renderWithProviders(<ActualsPage />)
    await screen.findByText(t.pacSnapshotsTitle)
    expect(screen.queryByText(t.pacReviewTitle)).not.toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/review"))).toBe(false)
  })
})
