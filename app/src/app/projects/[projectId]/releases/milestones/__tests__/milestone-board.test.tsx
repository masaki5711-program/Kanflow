import { beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, stubFetch } from "../../../gantt/__tests__/providers"
import { boardOf, punch, renderGeneral, stage, TODAY } from "./ms-fixtures"
import type { MilestoneBoard } from "../milestone-types"

vi.mock("next/navigation", async () => (await import("../../../backlog/__tests__/nav-mock")).navigationModule({ projectId: "p1" }))
vi.mock("@/lib/image-compress", () => ({ compressImageFile: vi.fn(async (f: File) => f) }))

const { resetUrl } = await import("../../../backlog/__tests__/nav-mock")
const { default: ReleasesPage } = await import("../../page")

const BOARD_URL = "/api/projects/p1/milestones"
let board: MilestoneBoard
let calls: Array<{ url: string; method: string; body: unknown }>

beforeEach(() => {
  resetUrl("/projects/p1/releases")
  calls = []
  board = boardOf({
    stages: [
      stage({ id: "s1", name: "仕様決定", status: "done", plannedStart: "2026-08-01", plannedEnd: "2026-08-20", conditions: [{ label: "仕様書承認済み", checked: true, checkedByName: "Bob", checkedAt: "2026-08-20T00:00:00.000Z" }] }),
      stage({ id: "s2", name: "製作", scheduleState: "delayed", plannedStart: "2026-09-01", plannedEnd: "2026-09-30", conditions: [{ label: "工場検査合格", checked: false, checkedByName: null, checkedAt: null }] }),
      stage({ id: "s3", name: "立会検収", isMilestone: true }),
    ],
    checks: [{ id: "c1", planItemId: null, name: "能力（サイクルタイム）", criterion: "CT 30秒以下", result: null, witness: null, checkedAt: null, note: null, recordedByName: null, sortOrder: 0 }],
    punchItems: [punch({ id: "pu1", dueDate: "2026-09-30" }), punch({ id: "pu2", title: "銘板の誤記", assigneeId: "me", assigneeName: "Alice" }), punch({ id: "pu3", title: "塗装はがれ", status: "done" })],
    documents: [{ id: "d1", name: "図面", status: "pending", receivedAt: null, receivedByName: null, note: null, sortOrder: 0, files: [] }],
  })
  stubFetch(async (url, init) => {
    const method = init?.method ?? "GET"
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : init?.body
    calls.push({ url, method, body })
    if (url === BOARD_URL && method === "GET") return jsonResponse(board)
    return jsonResponse({ id: "x" }, method === "POST" ? 201 : 200)
  })
})

const writes = () => calls.filter((c) => c.method !== "GET")

describe("マイルストーン・検収ボード (general /releases)", () => {
  it("shows the board with the summary strip and the template name", async () => {
    renderGeneral(<ReleasesPage />)
    expect(await screen.findByRole("heading", { level: 1, name: "マイルストーン・検収ボード" })).toBeInTheDocument()
    expect(screen.getByText("テンプレート: 設備導入")).toBeInTheDocument()
    const summary = screen.getByRole("region", { name: "ボードの集計" })
    expect(within(summary).getByText("1 / 3 完了")).toBeInTheDocument()
    expect(within(summary).getByText("遅れ 1")).toBeInTheDocument()
    expect(within(summary).getByText("期限切れ 1")).toBeInTheDocument()
    expect(calls.some((c) => c.url === "/api/projects/p1/releases")).toBe(false)
  })

  it("stage track: late stage in red, undated milestone, 完了条件 n/m", async () => {
    renderGeneral(<ReleasesPage />)
    const track = await screen.findByTestId("ms-stage-track")
    const late = within(track).getByRole("button", { name: "製作 の詳細を開く" })
    expect(late).toHaveAttribute("data-late", "true")
    expect(within(late).getByText("遅れ")).toBeInTheDocument()
    expect(within(late).getByText("完了条件 0/1")).toBeInTheDocument()
    const milestone = within(track).getByRole("button", { name: "立会検収 の詳細を開く" })
    expect(within(milestone).getByText(/日程未定/)).toBeInTheDocument()
    expect(within(milestone).getByLabelText("マイルストーン")).toBeInTheDocument()
    expect(within(track).getByRole("button", { name: "仕様決定 の詳細を開く" })).not.toHaveAttribute("data-late")
  })

  it("hides 予算 / 推移 tabs unless switched on", async () => {
    renderGeneral(<ReleasesPage />)
    await screen.findByRole("tablist", { name: "ボードの内容" })
    expect(screen.queryByRole("tab", { name: "予算" })).not.toBeInTheDocument()
    expect(screen.queryByRole("tab", { name: "推移" })).not.toBeInTheDocument()
  })

  it("shows the 予算 and 推移 tabs when switched on", async () => {
    board = { ...board, settings: { checkLabel: "検収", budgetEnabled: true, trendEnabled: true } }
    renderGeneral(<ReleasesPage />)
    expect(await screen.findByRole("tab", { name: "予算" })).toBeInTheDocument()
    expect(screen.getByRole("tab", { name: "推移" })).toBeInTheDocument()
    expect(within(screen.getByRole("region", { name: "ボードの集計" })).getByText("予算")).toBeInTheDocument()
  })

  it("records a check result with the 立会者 and today's date", async () => {
    const user = userEvent.setup()
    renderGeneral(<ReleasesPage />)
    const row = await screen.findByTestId("ms-check-row")
    await user.type(within(row).getByPlaceholderText(/立会者/), "メーカー 山田様")
    await user.click(within(row).getByRole("button", { name: "合格" }))
    await waitFor(() => expect(writes()).toContainEqual({ url: `${BOARD_URL}/checks/c1`, method: "PATCH", body: { result: "passed", witness: "メーカー 山田様", checkedAt: TODAY, note: null } }))
    expect(await screen.findByText("能力（サイクルタイム）: 合格 を記録しました")).toBeInTheDocument()
  })

  it("punch list: quick add, filters (open / overdue / mine)", async () => {
    const user = userEvent.setup()
    renderGeneral(<ReleasesPage />)
    await user.click(await screen.findByRole("tab", { name: /残課題/ }))
    expect(screen.getAllByTestId("ms-punch-row")).toHaveLength(2)
    await user.click(screen.getByRole("button", { name: /期限切れ/ }))
    expect(screen.getAllByTestId("ms-punch-row")).toHaveLength(1)
    await user.click(screen.getByRole("button", { name: /自分の担当/ }))
    expect(screen.getByText("銘板の誤記")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /すべて/ }))
    expect(screen.getAllByTestId("ms-punch-row")).toHaveLength(3)
    await user.type(screen.getByTestId("ms-punch-quick-add"), "カバー固定ボルト{Enter}")
    await waitFor(() => expect(writes()).toContainEqual({ url: `${BOARD_URL}/punch`, method: "POST", body: { title: "カバー固定ボルト", planItemId: null } }))
  })

  it("punch photo: a pasted image is uploaded to the item", async () => {
    const user = userEvent.setup()
    renderGeneral(<ReleasesPage />)
    await user.click(await screen.findByRole("tab", { name: /残課題/ }))
    const zone = screen.getByTestId("ms-punch-photos-pu1")
    const file = new File(["x"], "image.png", { type: "image/png" })
    fireEvent.paste(zone, { clipboardData: { files: [file] } })
    await waitFor(() => expect(writes().some((c) => c.url === `${BOARD_URL}/punch/pu1/photos` && c.method === "POST" && c.body instanceof FormData)).toBe(true))
  })

  it("documents: 揃った toggles the status", async () => {
    const user = userEvent.setup()
    renderGeneral(<ReleasesPage />)
    await user.click(await screen.findByRole("tab", { name: /引き渡し資料/ }))
    await user.click(screen.getByRole("switch", { name: "「図面」を「揃った」にする" }))
    await waitFor(() => expect(writes()).toContainEqual({ url: `${BOARD_URL}/documents/d1`, method: "PATCH", body: { status: "received" } }))
  })

  it("stage dialog: ticking a 完了条件 writes the board", async () => {
    const user = userEvent.setup()
    renderGeneral(<ReleasesPage />)
    await user.click(await screen.findByRole("button", { name: "製作 の詳細を開く" }))
    const dlg = await screen.findByRole("dialog")
    const box = within(dlg).getByRole("checkbox", { name: "工場検査合格" })
    await user.click(box)
    expect(box).toBeChecked()
    await waitFor(() => expect(writes()).toContainEqual({ url: `${BOARD_URL}/stages/s2/checklist`, method: "PUT", body: { label: "工場検査合格", checked: true } }))
  })

  it("no stages: the CTA and the 全体計画 link", async () => {
    board = boardOf()
    renderGeneral(<ReleasesPage />)
    expect(await screen.findByText("まだ工程がありません")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "テンプレートを読み込む" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "全体計画を開く" })).toHaveAttribute("href", "/projects/p1/plan")
  })

  it("dev (track only): no definition controls, results still recordable", async () => {
    board = { ...board, permissions: { canEdit: false, canTrack: true } }
    renderGeneral(<ReleasesPage />)
    const row = await screen.findByTestId("ms-check-row")
    expect(within(row).getByRole("button", { name: "合格" })).toBeInTheDocument()
    expect(within(row).queryByRole("button", { name: /を削除/ })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "ボードの設定" })).not.toBeInTheDocument()
  })
})
