import { beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, stubFetch } from "../../../gantt/__tests__/providers"
import { boardOf, improvement, renderKaizen } from "./board-fixtures"

vi.mock("next/navigation", async () => (await import("../../../backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))

const { resetUrl } = await import("../../../backlog/__tests__/nav-mock")
const { default: ReleasesPage } = await import("../../page")

const ITEMS = [
  improvement({
    id: "a",
    userStory: "段取り時間の短縮",
    metricName: "段取り時間",
    metricUnit: "分",
    baselineValue: 60,
    targetValue: 30,
    resultValue: 45,
    annualEffectUsd: 1_200_000,
    spaceSavedM2: 12.5,
    rollouts: [
      { id: "ro1", targetName: "第2ライン", status: "done", doneAt: null, sortOrder: 0 },
      { id: "ro2", targetName: "YMMA", status: "todo", doneAt: null, sortOrder: 1 },
    ],
    checks: [{ id: "c1", kind: "1m", dueDate: "2020-01-01T00:00:00.000Z", checkedAt: null, result: null, note: null, checkedByName: null, notifiedAt: null }],
    kaizenStage: "deploying",
  }),
  improvement({ id: "b", userStory: "不良の削減", kaizenStage: "measuring" }),
  improvement({ id: "c", userStory: "延期した改善", kaizenStage: "deferred" }),
]

let calls: Array<{ url: string; method: string }>

beforeEach(() => {
  resetUrl("/projects/p1/releases")
  calls = []
  stubFetch((url, init) => {
    calls.push({ url, method: init?.method ?? "GET" })
    if (url === "/api/projects/p1/improvements") return jsonResponse(boardOf(ITEMS))
    return jsonResponse({})
  })
})

describe("改善成果ボード (process_improvement /releases)", () => {
  it("renders the board instead of the release backlog, with the summary strip", async () => {
    renderKaizen(<ReleasesPage />)
    expect(await screen.findByRole("heading", { level: 1, name: "改善成果ボード" })).toBeInTheDocument()
    expect(calls.some((c) => c.url === "/api/projects/p1/releases")).toBe(false)
    const summary = screen.getByRole("region", { name: "段階ごとの件数" })
    expect(within(summary).getByText("$1,200,000")).toBeInTheDocument()
    // Space reduction is shown as an area, not as money.
    expect(within(summary).getByText("12.5 m²")).toBeInTheDocument()
    expect(within(summary).getByText("50%")).toBeInTheDocument()
  })

  it("groups cards into stage columns and collapses 延期", async () => {
    renderKaizen(<ReleasesPage />)
    const deploying = await screen.findByRole("region", { name: /横展開中/ })
    expect(within(deploying).getByText("段取り時間の短縮")).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: /効果確認中/ })).getByText("不良の削減")).toBeInTheDocument()
    expect(screen.queryByText("延期した改善")).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "延期（1 件）" }))
    expect(screen.getByText("延期した改善")).toBeInTheDocument()
  })

  it("a card shows Before → After (target), the achievement meter, money, rollout progress and an overdue check", async () => {
    renderKaizen(<ReleasesPage />)
    const deploying = await screen.findByRole("region", { name: /横展開中/ })
    const card = within(deploying).getByRole("article")
    expect(within(card).getByText("60 分")).toBeInTheDocument()
    expect(within(card).getByText("45 分")).toBeInTheDocument()
    expect(within(card).getByText("(目標 30 分)")).toBeInTheDocument()
    expect(within(card).getByRole("meter", { name: "達成率" })).toHaveAttribute("aria-valuenow", "50")
    expect(within(card).getByText("$1,200,000/年")).toBeInTheDocument()
    expect(within(card).getByText("12.5 m²")).toBeInTheDocument()
    expect(within(card).getByText("横展開 1/2")).toBeInTheDocument()
    expect(within(card).getByText(/定着確認の期限切れ/)).toHaveClass("text-danger")
  })

  it("opening a card puts ?item= in the URL and shows the detail dialog", async () => {
    renderKaizen(<ReleasesPage />)
    await userEvent.click(await screen.findByRole("button", { name: "段取り時間の短縮 の詳細を開く" }))
    const dialog = await screen.findByRole("dialog")
    expect(window.location.search).toBe("?item=a")
    for (const name of ["段階", "効果", "写真", "標準化", "横展開", "定着確認", "改善オーナーメモ"]) {
      expect(within(dialog).getByRole("region", { name })).toBeInTheDocument()
    }
  })

  it("deep link ?item= opens the dialog directly", async () => {
    resetUrl("/projects/p1/releases?item=b")
    renderKaizen(<ReleasesPage />)
    expect(await screen.findByRole("dialog", { name: "不良の削減" })).toBeInTheDocument()
  })

  it("hides PO actions for a member without release.manage", async () => {
    stubFetch(() => jsonResponse(boardOf(ITEMS, { canManage: false, canTrack: true })))
    renderKaizen(<ReleasesPage />)
    await screen.findByRole("heading", { level: 1, name: "改善成果ボード" })
    expect(screen.queryByRole("button", { name: "改善バックログから取り込み" })).not.toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole("link", { name: /Excel/ })).toHaveAttribute("href", expect.stringContaining("/api/projects/p1/improvements/export")))
  })
})
