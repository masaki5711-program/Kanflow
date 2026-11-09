import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders } from "@/components/__tests__/helpers"
import { PbiDevPanel } from "../pbi-dev-panel"
import { forgetGitState } from "../git-client-state"
import { link, panel } from "./fixtures"

/** 承認する / 承認を取り消す on the PBI panel (plan 11 K4): what is offered, the confirmation step, a double press. */
const en = getTranslations("en")
const SHA = "a".repeat(40)
const CONFIRM = `https://gitstation.example/-/confirm/projects/12/merge-requests/8?intent=approve&sha=${SHA}&integration=7&state=${"s".repeat(43)}`

type Item = { linkId: string; iid: number; approvals: number | null; approvedByMe: boolean; canApprove: { allowed: boolean; reason: string | null }; canUnapprove: { allowed: boolean; reason: string | null } }
let approvalsBody: unknown
let completeAnswers: Array<[number, unknown]>
const calls: string[] = []
const item = (over: Partial<Item> = {}): Item => ({ linkId: "l-8", iid: 8, approvals: 0, approvedByMe: false, canApprove: { allowed: true, reason: null }, canUnapprove: { allowed: true, reason: null }, ...over })

beforeEach(() => {
  forgetGitState()
  calls.length = 0
  approvalsBody = { supported: true, items: [item()], failed: [] }
  completeAnswers = [[200, { outcome: "approved", counted: true }]]
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      calls.push(`${init?.method ?? "GET"} ${u}${typeof init?.body === "string" ? ` ${init.body}` : ""}`)
      if (u.includes("/git/mr-approvals/start")) return jsonResponse({ attemptId: "att-1", confirmUrl: CONFIRM, expiresAt: "2026-11-09T00:10:00Z" }, 201)
      if (u.includes("/complete")) {
        const [status, body] = completeAnswers.shift() ?? [409, { error: "x", code: "GIT_APPROVAL_RETRY" }]
        return jsonResponse(body, status)
      }
      if (u.includes("/git/mr-approvals")) return jsonResponse(approvalsBody)
      return jsonResponse(panel({ links: [link({ id: "l-8", kind: "mr", ref: "8", title: "Login form", state: "opened" })] }))
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const render = () => renderWithProviders(<PbiDevPanel projectId="p1" pbiId="pbi-1" />, "en")
const posts = (part: string) => calls.filter((c) => c.startsWith("POST") && c.includes(part))

describe("MR approval on the PBI panel", () => {
  it("shows the count and 承認する; the confirmation is a link to GitStation in a new window, then 確認しました", async () => {
    const user = userEvent.setup()
    render()
    await screen.findByText(en.gitDevApprovals.replace("{count}", "0"))
    await user.click(screen.getByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") }))
    const group = await screen.findByRole("group", { name: en.gitDevConfirmGroup.replace("{iid}", "8") })
    const open = within(group).getByRole("link", { name: `${en.gitDevConfirmOpen} ${en.gitDevConfirmNewWindow}` })
    expect(open).toHaveAttribute("href", CONFIRM)
    expect(open).toHaveAttribute("target", "_blank")
    expect(open.getAttribute("rel")).toContain("noopener")
    await waitFor(() => expect(open).toHaveFocus())
    expect(posts("/start")).toEqual([`POST /api/projects/p1/git/mr-approvals/start ${JSON.stringify({ linkId: "l-8", intent: "approve" })}`])

    await user.click(within(group).getByRole("button", { name: en.gitDevConfirmDone }))
    await screen.findByText(en.gitDevApproved)
    expect(posts("/mr-approvals/att-1/complete")).toHaveLength(1)
    await waitFor(() => expect(screen.queryByRole("group")).not.toBeInTheDocument())
  })

  it("keeps the confirmation open and says what to do when GitStation has not been pressed yet", async () => {
    completeAnswers = [[409, { error: "x", code: "GIT_APPROVAL_NOT_CONFIRMED" }]]
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") }))
    const group = await screen.findByRole("group")
    await user.click(within(group).getByRole("button", { name: en.gitDevConfirmDone }))
    expect(await within(group).findByText(en.apiErrGitApprovalNotConfirmed)).toBeInTheDocument()
    expect(screen.getByRole("group")).toBeInTheDocument()
  })

  it("disables 確認しました while it is being sent (a double click sends once)", async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((r) => (release = r))
    const fetchMock = vi.mocked(fetch)
    const inner = fetchMock.getMockImplementation()
    fetchMock.mockImplementation(async (url, init) => {
      if (String(url).includes("/complete")) await gate
      return inner!(url, init)
    })
    const user = userEvent.setup()
    render()
    await user.click(await screen.findByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") }))
    const done = within(await screen.findByRole("group")).getByRole("button", { name: en.gitDevConfirmDone })
    await user.click(done)
    await user.click(done)
    expect(done).toBeDisabled()
    release()
    await screen.findByText(en.gitDevApproved)
    expect(posts("/complete")).toHaveLength(1)
  })

  it("offers 承認を取り消す after the user approved", async () => {
    approvalsBody = { supported: true, items: [item({ approvedByMe: true, approvals: 1 })], failed: [] }
    render()
    expect(await screen.findByRole("button", { name: en.gitDevUnapproveLabel.replace("{iid}", "8") })).toBeInTheDocument()
    expect(screen.getByText(en.gitDevApprovedByMe)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") })).not.toBeInTheDocument()
  })

  it("shows the reason instead of a button when GitStation would refuse (own MR / role)", async () => {
    approvalsBody = { supported: true, items: [item({ canApprove: { allowed: false, reason: "self_approval" } })], failed: [] }
    const { unmount } = render()
    expect(await screen.findByText(en.gitDevApproveReasonSelf)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") })).not.toBeInTheDocument()
    unmount()
    approvalsBody = { supported: true, items: [item({ canApprove: { allowed: false, reason: "required_role" } })], failed: [] }
    render()
    expect(await screen.findByText(en.gitDevApproveReasonRole)).toBeInTheDocument()
  })

  it("shows no button (and one note) without an employee number, and nothing when not supported", async () => {
    approvalsBody = { supported: false, reason: "no_employee_number" }
    const { unmount } = render()
    expect(await screen.findByText(en.gitDevApproveNoEmployee)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") })).not.toBeInTheDocument()
    unmount()
    approvalsBody = { error: "権限がありません", code: "FORBIDDEN" }
    render()
    await screen.findByText("Login form")
    await waitFor(() => expect(calls.some((c) => c.includes("/git/mr-approvals?pbiId=pbi-1"))).toBe(true))
    expect(screen.queryByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") })).not.toBeInTheDocument()
    expect(screen.queryByText(en.gitDevApproveNoEmployee)).not.toBeInTheDocument()
  })
})
