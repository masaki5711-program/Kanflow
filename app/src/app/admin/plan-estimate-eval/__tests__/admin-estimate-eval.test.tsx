import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import type { EvalOverview, LineageEval } from "../admin-estimate-eval"
import type { LineageParams } from "../param-proposal"

const m = vi.hoisted(() => ({ query: vi.fn(), fetch: vi.fn(), confirm: vi.fn(), success: vi.fn(), error: vi.fn(), mutate: vi.fn(), refetch: vi.fn() }))
vi.mock("@/lib/language-context", async () => {
  const { getTranslations: get } = await import("@/lib/i18n")
  return { useLanguage: () => ({ t: get("ja"), language: "ja" }) }
})
vi.mock("@/hooks", () => ({ useApiQuery: () => m.query(), apiFetch: (...a: unknown[]) => m.fetch(...a) }))
vi.mock("@/hooks/api-client", () => ({ localizeApiError: (e: unknown) => String(e) }))
vi.mock("@/hooks/use-document-title", () => ({ useDocumentTitle: () => undefined }))
vi.mock("@/components/ui", async (orig) => ({
  ...(await orig<typeof import("@/components/ui")>()),
  useConfirm: () => m.confirm,
  useToast: () => ({ success: m.success, error: m.error }),
}))

const { AdminEstimateEval } = await import("../admin-estimate-eval")
const t = getTranslations("ja")

const rec = { id: "e1", evaluatedOn: "2026-11-06", n: 7, skipped: 1, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 }
const DEFAULTS = { outlierMads: 3, halfLifeDays: 365, shrinkK: 3, spreadPrior: 0.25 }
const noParams: LineageParams = { active: null, lastEnded: null, latest: null, searching: false }
const subset = (mape: number, projects: number) => ({ projects, leaves: projects * 3, mape, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 })
const cand = (mape: number) => ({ full: { n: 9, mape, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 }, search: subset(mape, 6), holdout: subset(mape, 3) })
const proposal = (over: Partial<NonNullable<LineageParams["latest"]>> = {}): NonNullable<LineageParams["latest"]> => ({
  id: "p1",
  createdAt: "2026-11-10T03:00:00Z",
  outcome: "propose",
  reason: null,
  params: { ...DEFAULTS, shrinkK: 1.5 },
  baseline: DEFAULTS,
  before: cand(0.2),
  after: cand(0.12),
  candidates: 81,
  evaluated: 81,
  outdated: false,
  decision: null,
  ...over,
})
const line = (over: Partial<LineageEval>): LineageEval => ({ lineage: "template:t1", name: "製品開発", latest: rec, outdated: false, passes: true, reason: null, approval: null, lastEnded: null, on: false, params: noParams, ...over })
const overview = (lineages: LineageEval[], searching: string[] = []): EvalOverview => ({
  methodVersion: "e2-v1",
  conditions: { minProjects: 5, mapeRatio: 0.85, p80Range: [0.7, 0.9] },
  paramSearch: { defaults: DEFAULTS, grid: { outlierMads: [2.5, 3, 3.5], halfLifeDays: [180, 365, 730], shrinkK: [1.5, 3, 6], spreadPrior: [0.15, 0.25, 0.35] }, margin: 0.05, searching },
  lineages,
})
const loaded = (data: EvalOverview) => m.query.mockReturnValue({ data, isLoading: false, error: null, refetch: m.refetch, mutate: m.mutate })

beforeEach(() => vi.clearAllMocks())

describe("/admin/plan-estimate-eval", () => {
  it("shows each lineage's numbers with the condition in words, and the state", () => {
    loaded(overview([line({}), line({ lineage: "schedule:abc def", name: null, latest: { ...rec, id: "e2", n: 2 }, passes: false, reason: "not_enough_actuals" })]))
    render(<AdminEstimateEval />)
    const ready = screen.getByRole("article", { name: "製品開発" })
    expect(within(ready).getByText(t.peeAdminStateReady)).toBeInTheDocument()
    expect(within(ready).getByText("10%")).toBeInTheDocument()
    expect(within(ready).getAllByText(t.peeAdminMet)).toHaveLength(4)
    expect(within(ready).getByText("対象外 1 件")).toBeInTheDocument()
    expect(within(ready).getByRole("button", { name: t.peeAdminApprove })).toBeInTheDocument()
    // A lineage with a space and no name: a neutral heading (the id is a secondary line), still a named article.
    const off = screen.getByRole("article", { name: t.peeAdminUnnamed })
    expect(within(off).getByText(/schedule:abc def/)).toBeInTheDocument()
    expect(within(off).getByText(t.peeAdminStateOff)).toBeInTheDocument()
    expect(within(off).getAllByText(t.peeAdminNotMet).length).toBeGreaterThan(0)
    expect(within(off).getByText(/理由:/)).toBeInTheDocument()
    // Cannot be approved while it does not pass.
    expect(within(off).queryByRole("button", { name: t.peeAdminApprove })).toBeNull()
    // The thresholds come from the API, not the page.
    expect(screen.getByText(/5 件以上/)).toBeInTheDocument()
  })

  it("an outdated record cannot be approved and says why; an ended approval says how it ended", () => {
    loaded(overview([line({ outdated: true, lastEnded: { endedAt: "2026-11-06T03:00:00Z", reason: "failed" } })]))
    render(<AdminEstimateEval />)
    expect(screen.getByText(t.peeAdminStateOutdated)).toBeInTheDocument()
    expect(screen.getByText(t.peeAdminOutdated)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.peeAdminApprove })).toBeNull()
    expect(screen.getByText(/自動で無効になりました/)).toBeInTheDocument()
  })

  it("moves the focus to the card's heading after approving (its button was replaced)", async () => {
    loaded(overview([line({})]))
    m.confirm.mockResolvedValue(true)
    m.fetch.mockResolvedValue(overview([line({ on: true, approval: { approvedAt: "2026-11-06T03:00:00Z", approvedByName: "Admin" } })]))
    const { rerender } = render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeAdminApprove }))
    loaded(overview([line({ on: true, approval: { approvedAt: "2026-11-06T03:00:00Z", approvedByName: "Admin" } })]))
    rerender(<AdminEstimateEval />)
    expect(screen.getByRole("heading", { level: 2, name: "製品開発" })).toHaveFocus()
  })

  it("a recompute where some lineages failed says how many", async () => {
    loaded(overview([line({})]))
    m.fetch.mockResolvedValue({ ...overview([line({})]), failed: ["a", "b"] })
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeAdminRecompute }))
    expect(m.error).toHaveBeenCalledWith("2 系統の計算に失敗しました。ほかの系統は計算しました")
    expect(m.success).not.toHaveBeenCalled()
  })

  it("approves after confirming, sending the record id that was shown", async () => {
    loaded(overview([line({})]))
    m.confirm.mockResolvedValue(true)
    m.fetch.mockResolvedValue(overview([line({ on: true, approval: { approvedAt: "2026-11-06T03:00:00Z", approvedByName: "Admin" } })]))
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeAdminApprove }))
    expect(m.fetch).toHaveBeenCalledWith("/api/admin/plan-estimate-eval/approval", { method: "POST", json: { decision: "approve", lineage: "template:t1", evalId: "e1" } })
    expect(m.mutate).toHaveBeenCalled()
    expect(m.success).toHaveBeenCalledWith(t.peeAdminApproved)
  })

  it("does nothing when the confirmation is cancelled", async () => {
    loaded(overview([line({})]))
    m.confirm.mockResolvedValue(false)
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeAdminApprove }))
    expect(m.fetch).not.toHaveBeenCalled()
  })

  it("an approved lineage offers withdrawing, and says it waits while the results do not pass", () => {
    loaded(overview([line({ passes: false, reason: "p80_out_of_range", approval: { approvedAt: "2026-11-06T03:00:00Z", approvedByName: "Admin" } })]))
    render(<AdminEstimateEval />)
    expect(screen.getByRole("button", { name: t.peeAdminWithdraw })).toBeInTheDocument()
    expect(screen.getByText(t.peeAdminApproveWaits)).toBeInTheDocument()
  })

  it("an error from the server is shown and the list is reloaded", async () => {
    loaded(overview([line({})]))
    m.confirm.mockResolvedValue(true)
    m.fetch.mockRejectedValue(new Error("changed"))
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeAdminApprove }))
    expect(m.error).toHaveBeenCalled()
    expect(m.refetch).toHaveBeenCalled()
  })

  it("recomputes every lineage", async () => {
    loaded(overview([line({})]))
    m.fetch.mockResolvedValue(overview([line({})]))
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeAdminRecompute }))
    expect(m.fetch).toHaveBeenCalledWith("/api/admin/plan-estimate-eval", { method: "POST" })
    expect(m.success).toHaveBeenCalledWith(t.peeAdminRecomputed)
  })

  it("an empty portfolio says how a lineage appears", () => {
    loaded(overview([]))
    render(<AdminEstimateEval />)
    expect(screen.getByText(t.peeAdminEmptyTitle)).toBeInTheDocument()
  })

  it("explains the parameter search with the grid size and margin from the API", () => {
    loaded(overview([line({})]))
    render(<AdminEstimateEval />)
    expect(screen.getByText(/81 通りを試し/)).toBeInTheDocument()
    expect(screen.getByText(/5% 以上小さい/)).toBeInTheDocument()
    expect(screen.getByText(t.peeParamsInUseDefault)).toBeInTheDocument()
    expect(screen.getByText(t.peeParamsNone)).toBeInTheDocument()
  })

  it("shows a proposal's settings and numbers before / after in captioned tables", () => {
    loaded(overview([line({ params: { ...noParams, latest: proposal() } })]))
    render(<AdminEstimateEval />)
    const settings = screen.getByRole("table", { name: "製品開発 の今の値と提案の値" })
    const k = within(settings).getByRole("row", { name: /縮め/ })
    expect(within(k).getByText("3")).toBeInTheDocument()
    expect(within(k).getByText("1.5")).toBeInTheDocument()
    const metrics = screen.getByRole("table", { name: "製品開発 の今の値と提案の値での検証の成績" })
    const err = within(metrics).getByRole("row", { name: /期間の誤差（全 9 件）/ })
    expect(within(err).getByText("20%")).toBeInTheDocument()
    expect(within(err).getByText("12%")).toBeInTheDocument()
    expect(within(metrics).getByRole("row", { name: /確かめ用の新しい 3 件/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.peeParamsApprove })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.peeParamsReject })).toBeInTheDocument()
  })

  it("approves the proposal that was shown, after confirming", async () => {
    loaded(overview([line({ params: { ...noParams, latest: proposal() } })]))
    m.confirm.mockResolvedValue(true)
    m.fetch.mockResolvedValue(overview([line({})]))
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeParamsApprove }))
    expect(m.fetch).toHaveBeenCalledWith("/api/admin/plan-estimate-eval/params", { method: "POST", json: { action: "approve", lineage: "template:t1", proposalId: "p1" } })
    expect(m.success).toHaveBeenCalledWith(t.peeParamsApproved)
  })

  it("rejects after confirming; a cancelled confirmation sends nothing", async () => {
    loaded(overview([line({ params: { ...noParams, latest: proposal() } })]))
    m.confirm.mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    m.fetch.mockResolvedValue(overview([line({})]))
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeParamsReject }))
    expect(m.fetch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole("button", { name: t.peeParamsReject }))
    expect(m.fetch).toHaveBeenCalledWith("/api/admin/plan-estimate-eval/params", { method: "POST", json: { action: "reject", lineage: "template:t1", proposalId: "p1" } })
  })

  it("an outdated proposal cannot be approved and says why; 'keep the defaults' says why in words", () => {
    loaded(
      overview([
        line({ params: { ...noParams, latest: proposal({ outdated: true }) } }),
        line({ lineage: "template:t2", name: "別の系統", params: { ...noParams, latest: proposal({ id: "p2", outcome: "keep_default", reason: "holdout_worse" }) } }),
      ]),
    )
    render(<AdminEstimateEval />)
    expect(screen.getByText(t.peeParamsOutdated)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.peeParamsApprove })).toBeNull()
    const other = screen.getByRole("article", { name: "別の系統" })
    expect(within(other).getByText(/提案はありません: よい組み合わせはありましたが、確かめ用/)).toBeInTheDocument()
  })

  it("approved settings are listed and can be returned to the defaults; an automatic fall back says so", async () => {
    const active = { params: { ...DEFAULTS, shrinkK: 1.5 }, approvedAt: "2026-11-10T03:00:00Z", approvedByName: "Admin" }
    loaded(overview([line({ params: { ...noParams, active } }), line({ lineage: "template:t2", name: "別の系統", params: { ...noParams, lastEnded: { endedAt: "2026-11-10T03:00:00Z", reason: "failed" } } })]))
    m.confirm.mockResolvedValue(true)
    m.fetch.mockResolvedValue(overview([line({})]))
    render(<AdminEstimateEval />)
    expect(screen.getByText(/Admin が .* に承認した値を使っています/)).toBeInTheDocument()
    expect(screen.getByText(/自動で既定の値に戻りました/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.peeParamsRevert }))
    expect(m.fetch).toHaveBeenCalledWith("/api/admin/plan-estimate-eval/params", { method: "POST", json: { action: "revert", lineage: "template:t1" } })
    expect(m.success).toHaveBeenCalledWith(t.peeParamsReverted)
  })

  it("starts the search in the background and re-reads the list while lineages are searched", async () => {
    loaded(overview([line({})]))
    m.fetch.mockResolvedValue(overview([line({})], ["template:t1"]))
    render(<AdminEstimateEval />)
    await userEvent.click(screen.getByRole("button", { name: t.peeParamsSearch }))
    expect(m.fetch).toHaveBeenCalledWith("/api/admin/plan-estimate-eval/params", { method: "POST", json: { action: "search" } })
    expect(m.success).toHaveBeenCalledWith(t.peeParamsSearchQueued)
  })

  it("polls while a search runs and says so on the card", () => {
    vi.useFakeTimers()
    try {
      loaded(overview([line({ params: { ...noParams, searching: true } })], ["template:t1"]))
      render(<AdminEstimateEval />)
      expect(screen.getByText(t.peeParamsSearchingLine)).toBeInTheDocument()
      vi.advanceTimersByTime(5000)
      expect(m.refetch).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it("a proposal searched while approved settings were in use is compared with them, not with the defaults", () => {
    const inUse = { ...DEFAULTS, shrinkK: 1.5 }
    loaded(overview([line({ params: { ...noParams, active: { params: inUse, approvedAt: "2026-11-10T03:00:00Z", approvedByName: "Admin" }, latest: proposal({ baseline: inUse, params: { ...inUse, spreadPrior: 0.35 } }) } })]))
    render(<AdminEstimateEval />)
    const settings = screen.getByRole("table", { name: "製品開発 の今の値と提案の値" })
    expect(within(settings).getByRole("columnheader", { name: t.peeParamsColInUse })).toBeInTheDocument()
    const k = within(settings).getByRole("row", { name: /縮め/ })
    expect(within(k).getAllByText("1.5")).toHaveLength(2)
  })
})
