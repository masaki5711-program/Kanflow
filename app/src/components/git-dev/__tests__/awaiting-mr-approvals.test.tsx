import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders } from "@/components/__tests__/helpers"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const { MyProjectTasks } = await import("@/app/projects/[projectId]/dashboard/my-project-tasks")
const { toAwaitingMrApprovals } = await import("../awaiting-mr-approvals")

/** 承認を待っている MR in the dashboard's 自分のタスク card (plan 11 K4, option b). Synthetic data only. */
const en = getTranslations("en")
const SHA = "a".repeat(40)
const CONFIRM = `https://gitstation.example/-/confirm/projects/12/merge-requests/8?intent=approve&sha=${SHA}&integration=7&state=${"s".repeat(43)}`
const item = (over: Record<string, unknown> = {}) => ({
  linkId: "l-8", iid: 8, headSha: SHA, approvals: null, approvedByMe: false,
  canApprove: { allowed: true, reason: null }, canUnapprove: { allowed: true, reason: null },
  pbiId: "pbi-1", pbiKey: "PBI-4", pbiDisplayId: 4, title: "Login form", url: "https://gitstation.example/app/portal/-/merge_requests/8", ...over,
})

let awaitingBody: unknown
const calls: string[] = []

beforeEach(() => {
  calls.length = 0
  awaitingBody = { supported: true, items: [item()], failed: [] }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url)
      calls.push(`${init?.method ?? "GET"} ${u}`)
      if (u.includes("/git/mr-approvals/start")) return jsonResponse({ attemptId: "att-1", confirmUrl: CONFIRM, expiresAt: "2026-11-09T00:10:00Z" }, 201)
      if (u.includes("/complete")) return jsonResponse({ outcome: "approved", counted: true })
      if (u.includes("/git/mr-approvals/awaiting")) return jsonResponse(awaitingBody)
      return jsonResponse({ error: "unexpected", code: "NOT_FOUND" }, 404)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

const render = (showMrApprovals = true) => renderWithProviders(<MyProjectTasks projectId="p1" tasks={[]} showMrApprovals={showMrApprovals} />, "en")
const awaitingReads = () => calls.filter((c) => c === "GET /api/projects/p1/git/mr-approvals/awaiting")

describe("承認を待っている MR on the dashboard", () => {
  it("lists each merge request with its PBI key, a link to the PBI and 承認する (same confirmation flow)", async () => {
    const user = userEvent.setup()
    render()
    const section = await screen.findByRole("region", { name: `${en.gitDevAwaitingTitle} (1)` })
    const link = within(section).getByRole("link", { name: /PBI-4/ })
    expect(link).toHaveAttribute("href", "/projects/p1/backlog?pbi=4")
    expect(link).toHaveTextContent("Login form")
    await user.click(within(section).getByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") }))
    const group = await within(section).findByRole("group", { name: en.gitDevConfirmGroup.replace("{iid}", "8") })
    expect(within(group).getByRole("link", { name: `${en.gitDevConfirmOpen} ${en.gitDevConfirmNewWindow}` })).toHaveAttribute("href", CONFIRM)
    awaitingBody = { supported: true, items: [], failed: [] }
    await user.click(within(group).getByRole("button", { name: en.gitDevConfirmDone }))
    await screen.findByText(en.gitDevApproved)
    // Re-read after the approval: the approved MR leaves the list (and the section with it).
    await waitFor(() => expect(screen.queryByRole("region", { name: new RegExp(en.gitDevAwaitingTitle) })).not.toBeInTheDocument())
    expect(awaitingReads()).toHaveLength(2)
  })

  it("shows nothing when the list is empty, when not supported or refused, and asks nothing when not enabled", async () => {
    awaitingBody = { supported: true, items: [], failed: [] }
    const a = render()
    await waitFor(() => expect(awaitingReads()).toHaveLength(1))
    expect(screen.queryByText(en.gitDevAwaitingTitle, { exact: false })).not.toBeInTheDocument()
    a.unmount()
    awaitingBody = { supported: false, reason: "off" }
    const b = render()
    await waitFor(() => expect(awaitingReads()).toHaveLength(2))
    expect(screen.queryByText(en.gitDevAwaitingTitle, { exact: false })).not.toBeInTheDocument()
    expect(screen.queryByText(en.gitDevApproveNoEmployee)).not.toBeInTheDocument()
    b.unmount()
    render(false)
    expect(screen.getByText(en.dashboardMyTasksEmpty)).toBeInTheDocument()
    expect(awaitingReads()).toHaveLength(2)
  })

  it("shows one note (no list, no button) when the user has no employee number", async () => {
    awaitingBody = { supported: false, reason: "no_employee_number" }
    render()
    expect(await screen.findByText(en.gitDevApproveNoEmployee)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: en.gitDevApproveLabel.replace("{iid}", "8") })).not.toBeInTheDocument()
  })

  it("parses defensively: rows without PBI fields are dropped, odd bodies are not supported", () => {
    expect(toAwaitingMrApprovals({ supported: true, items: [item(), { ...item(), pbiKey: 4 }, null], failed: ["x", 1] })).toEqual({ supported: true, items: [item()], failed: ["x"] })
    expect(toAwaitingMrApprovals({ error: "x" })).toEqual({ supported: false, reason: "off" })
    expect(toAwaitingMrApprovals({ supported: false, reason: "no_employee_number" })).toEqual({ supported: false, reason: "no_employee_number" })
  })
})
