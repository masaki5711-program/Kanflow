import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import type { EvalOverview, LineageEval } from "../admin-estimate-eval"

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

const rec = { id: "e1", evaluatedOn: "2026-11-06", n: 7, mape: 0.1, mapeTemplate: 0.4, p80Hit: 0.8, endErrorDays: 1, endErrorTemplateDays: 5 }
const line = (over: Partial<LineageEval>): LineageEval => ({ lineage: "template:t1", name: "製品開発", latest: rec, passes: true, reason: null, approval: null, on: false, ...over })
const overview = (lineages: LineageEval[]): EvalOverview => ({ methodVersion: "e2-v1", conditions: { minProjects: 5, mapeRatio: 0.85, p80Range: [0.7, 0.9] }, lineages })
const loaded = (data: EvalOverview) => m.query.mockReturnValue({ data, isLoading: false, error: null, refetch: m.refetch, mutate: m.mutate })

beforeEach(() => vi.clearAllMocks())

describe("/admin/plan-estimate-eval", () => {
  it("shows each lineage's numbers with the condition in words, and the state", () => {
    loaded(overview([line({}), line({ lineage: "name:手作り", name: null, latest: { ...rec, id: "e2", n: 2 }, passes: false, reason: "not_enough_actuals" })]))
    render(<AdminEstimateEval />)
    const ready = screen.getByRole("article", { name: "製品開発" })
    expect(within(ready).getByText(t.peeAdminStateReady)).toBeInTheDocument()
    expect(within(ready).getByText("10%")).toBeInTheDocument()
    expect(within(ready).getAllByText(t.peeAdminMet)).toHaveLength(4)
    expect(within(ready).getByRole("button", { name: t.peeAdminApprove })).toBeInTheDocument()
    const off = screen.getByRole("article", { name: "name:手作り" })
    expect(within(off).getByText(t.peeAdminStateOff)).toBeInTheDocument()
    expect(within(off).getAllByText(t.peeAdminNotMet).length).toBeGreaterThan(0)
    expect(within(off).getByText(/理由:/)).toBeInTheDocument()
    // Cannot be approved while it does not pass.
    expect(within(off).queryByRole("button", { name: t.peeAdminApprove })).toBeNull()
    // The thresholds come from the API, not the page.
    expect(screen.getByText(/5 件以上/)).toBeInTheDocument()
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
})
