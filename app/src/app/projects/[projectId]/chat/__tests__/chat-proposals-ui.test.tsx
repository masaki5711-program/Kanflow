import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { encodeChatEvent, type ChatProposal } from "@/lib/chat-proposals"
import { jsonResponse, renderWithProviders } from "../../gantt/__tests__/providers"

const nav = vi.hoisted(() => ({ push: vi.fn() }))
const session = vi.hoisted(() => ({ value: { user: { id: "u1", role: "member" } } as { user: { id: string; role: string } } }))

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }), useRouter: () => ({ push: nav.push }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: session.value }) }))
vi.mock("next/dynamic", () => ({ default: () => () => null }))

const { default: ChatPage } = await import("../page")
const t = getTranslations("ja")

const CREATE: ChatProposal = {
  kind: "create_pbi", proposalId: "prop_create", title: "SSO ログイン", userStory: "ユーザーとして…", acceptanceCriteria: "- 動く",
  storyPoints: 3, epic: null, reason: "要望あり", possibleDuplicates: [{ displayId: 7, title: "SSO 対応", similarity: 0.7 }],
}
const SPLIT: ChatProposal = {
  kind: "task_split", proposalId: "prop_split", pbi: { id: "pb-1", displayId: 4, title: "Login" }, sprint: { id: "s1", name: "Sprint 1" },
  tasks: [{ name: "設計", estimate: 2 }, { name: "実装", estimate: 3 }], skippedExisting: [], reason: "",
}
const STATUS: ChatProposal = {
  kind: "status_change", proposalId: "prop_status", entity: "pbi", target: { id: "pb-1", title: "Login", displayId: 4, sprintId: null },
  fromStatus: "not_ready", toStatus: "ready", version: 2, reason: "",
}

type Route = (url: string, init?: RequestInit) => Response | undefined
let fetchMock: ReturnType<typeof vi.fn>
let members: Array<{ role: string; user: { id: string } }>

function chatStream(proposals: ChatProposal[]): Response {
  const body = `提案します。${proposals.map((p) => encodeChatEvent({ type: "proposal", proposal: p })).join("")}カードで承認してください。`
  return new Response(body, { status: 200, headers: { "content-type": "text/plain" } })
}

function stub(proposals: ChatProposal[], extra: Route = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const custom = extra(url, init)
    if (custom) return custom
    if (url === "/api/projects/p1/chat") return chatStream(proposals)
    if (url === "/api/projects/p1/members") return jsonResponse(members)
    return jsonResponse({ error: "unexpected" }, 500)
  })
  vi.stubGlobal("fetch", fetchMock)
}

const calls = (pred: (url: string, init?: RequestInit) => boolean) =>
  fetchMock.mock.calls.filter(([u, i]) => pred(String(u), i as RequestInit | undefined))
const bodyOf = (init?: RequestInit) => JSON.parse(String(init?.body))

async function askAndGetCard(title: string) {
  const user = userEvent.setup()
  renderWithProviders(<ChatPage />)
  await user.type(screen.getByRole("textbox", { name: t.chatInputLabel }), "PBIを作成して")
  await user.click(screen.getByRole("button", { name: t.chatSend }))
  const card = (await screen.findByRole("heading", { name: title })).closest("section") as HTMLElement
  return { user, card }
}

beforeEach(() => {
  nav.push.mockReset()
  session.value = { user: { id: "u1", role: "member" } }
  members = [{ role: "po", user: { id: "u1" } }]
})
afterEach(() => vi.unstubAllGlobals())

describe("chat proposal cards", () => {
  it("renders the card from the stream frame without leaking JSON into the answer", async () => {
    stub([CREATE])
    const { card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
    expect(within(card).getByText("SSO ログイン")).toBeInTheDocument()
    expect(within(card).getByRole("note")).toHaveTextContent("#7 SSO 対応")
    expect(screen.getByText(/提案します。/)).toHaveTextContent("提案します。カードで承認してください。")
    expect(screen.queryByText(/prop_create/)).not.toBeInTheDocument()
  })

  it("approve creates the PBI via the normal API, marks the card applied and toasts a deep link", async () => {
    stub([CREATE], (url, init) => (url === "/api/projects/p1/backlog" && init?.method === "POST" ? jsonResponse({ id: "pb-new" }, 201) : undefined))
    const { user, card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
    const approve = within(card).getByRole("button", { name: t.chatProposalApproveCreate })
    await waitFor(() => expect(approve).toBeEnabled())
    await user.click(approve)

    const posts = calls((u, i) => u === "/api/projects/p1/backlog" && i?.method === "POST")
    expect(posts).toHaveLength(1)
    expect(bodyOf(posts[0][1] as RequestInit)).toEqual({ initiative: "SSO ログイン", userStory: "ユーザーとして…", acceptanceCriteria: "- 動く", workloadScore: 3 })
    expect(await within(card).findByText(t.chatProposalApplied)).toBeInTheDocument()
    expect(within(card).getByRole("link", { name: t.chatProposalOpen })).toHaveAttribute("href", "/projects/p1/backlog?pbi=pb-new")
    expect(within(card).queryByRole("button", { name: t.chatProposalApproveCreate })).not.toBeInTheDocument()

    expect(await screen.findByText(t.chatProposalPbiCreated)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.chatProposalOpen }))
    expect(nav.push).toHaveBeenCalledWith("/projects/p1/backlog?pbi=pb-new")
  })

  it("reject marks the card rejected without calling any API", async () => {
    stub([CREATE])
    const { user, card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
    await user.click(within(card).getByRole("button", { name: t.chatProposalReject }))
    expect(within(card).getByText(t.chatProposalRejected)).toBeInTheDocument()
    expect(within(card).queryByRole("button")).not.toBeInTheDocument()
    expect(calls((_u, i) => i?.method === "POST" && _u !== "/api/projects/p1/chat")).toHaveLength(0)
  })

  it("disables approve for users without the permission (dev cannot create PBIs)", async () => {
    members = [{ role: "dev", user: { id: "u1" } }]
    stub([CREATE, SPLIT])
    const { card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
    await waitFor(() => expect(within(card).getByText(t.chatProposalNoPermission)).toBeInTheDocument())
    expect(within(card).getByRole("button", { name: t.chatProposalApproveCreate })).toBeDisabled()
    // task.write is open to every member → the split card stays approvable.
    const split = screen.getByRole("heading", { name: t.chatProposalTaskSplitTitle }).closest("section") as HTMLElement
    expect(within(split).getByRole("button", { name: t.chatProposalApproveCreate })).toBeEnabled()
  })

  it("admins skip the member lookup and may approve", async () => {
    session.value = { user: { id: "adm", role: "admin" } }
    stub([CREATE])
    const { card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
    await waitFor(() => expect(within(card).getByRole("button", { name: t.chatProposalApproveCreate })).toBeEnabled())
    expect(calls((u) => u.endsWith("/members"))).toHaveLength(0)
  })

  it("a task split posts every task in order and links the first task", async () => {
    let n = 0
    stub([SPLIT], (url, init) => (url === "/api/projects/p1/sprints/s1/tasks" && init?.method === "POST" ? jsonResponse({ id: `t${++n}` }, 201) : undefined))
    const { user, card } = await askAndGetCard(t.chatProposalTaskSplitTitle)
    const approve = within(card).getByRole("button", { name: t.chatProposalApproveCreate })
    await waitFor(() => expect(approve).toBeEnabled())
    await user.click(approve)
    const posts = calls((u, i) => u.endsWith("/sprints/s1/tasks") && i?.method === "POST")
    expect(posts.map((c) => bodyOf(c[1] as RequestInit).taskName)).toEqual(["設計", "実装"])
    expect(await screen.findByText(t.chatProposalTasksCreated.replace("{count}", "2"))).toBeInTheDocument()
    expect(within(card).getByRole("link", { name: t.chatProposalOpen })).toHaveAttribute("href", "/projects/p1/sprints?task=t1")
  })

  it("a stale version (409) shows the conflict message and keeps the card approvable", async () => {
    stub([STATUS], (url, init) =>
      url === "/api/projects/p1/backlog/pb-1" && init?.method === "PATCH"
        ? jsonResponse({ error: "conflict", code: "VERSION_CONFLICT", current: null }, 409)
        : undefined,
    )
    const { user, card } = await askAndGetCard(t.chatProposalStatusChangeTitle)
    const approve = within(card).getByRole("button", { name: t.chatProposalApproveApply })
    await waitFor(() => expect(approve).toBeEnabled())
    await user.click(approve)
    const patch = calls((u, i) => u === "/api/projects/p1/backlog/pb-1" && i?.method === "PATCH")
    expect(bodyOf(patch[0][1] as RequestInit)).toEqual({ status: "ready", version: 2 })
    expect(await screen.findByText(t.apiErrVersionConflict)).toBeInTheDocument()
    await waitFor(() => expect(within(card).getByRole("button", { name: t.chatProposalApproveApply })).toBeEnabled())
    expect(within(card).queryByText(t.chatProposalApplied)).not.toBeInTheDocument()
  })

  describe("in a stored thread (P-02: outcome persisted, duplicate-proof)", () => {
    const OUTCOME_URL = "/api/projects/p1/chat/threads/t1/proposals/prop_create"
    const threadStream = (url: string) =>
      url === "/api/projects/p1/chat"
        ? new Response(`提案します。${encodeChatEvent({ type: "proposal", proposal: CREATE })}`, {
            status: 200,
            headers: { "content-type": "text/plain", "X-Chat-Thread-Id": "t1" },
          })
        : undefined

    it("reserves, creates, then confirms with the created id", async () => {
      stub([CREATE], (url, init) => {
        if (url === OUTCOME_URL) return jsonResponse({ outcome: null })
        if (url === "/api/projects/p1/backlog" && init?.method === "POST") return jsonResponse({ id: "pb-new" }, 201)
        return threadStream(url)
      })
      const { user, card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
      const approve = within(card).getByRole("button", { name: t.chatProposalApproveCreate })
      await waitFor(() => expect(approve).toBeEnabled())
      await user.click(approve)
      await waitFor(() => expect(within(card).getByText(t.chatProposalApplied)).toBeInTheDocument())
      const order = fetchMock.mock.calls
        .map(([u, i]) => `${(i as RequestInit | undefined)?.method ?? "GET"} ${String(u)}`)
        .filter((s) => s.startsWith("POST") && !s.endsWith("/chat"))
      expect(order).toEqual([`POST ${OUTCOME_URL}`, "POST /api/projects/p1/backlog", `POST ${OUTCOME_URL}`])
      const outcomeBodies = calls((u) => u === OUTCOME_URL).map((c) => bodyOf(c[1] as RequestInit))
      expect(outcomeBodies).toEqual([{ action: "reserve" }, { action: "confirm", appliedEntityId: "pb-new" }])
    })

    it("an already-applied proposal (409) creates nothing and shows the stored state", async () => {
      const applied = { status: "applied", appliedEntityId: "pb-98", at: "2026-10-01T00:00:00.000Z", by: "u1" }
      stub([CREATE], (url) =>
        url === OUTCOME_URL ? jsonResponse({ error: "handled", code: "CONFLICT", outcome: applied }, 409) : threadStream(url),
      )
      const { user, card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
      const approve = within(card).getByRole("button", { name: t.chatProposalApproveCreate })
      await waitFor(() => expect(approve).toBeEnabled())
      await user.click(approve)
      expect(await screen.findByText(t.chatProposalAlreadyHandled)).toBeInTheDocument()
      expect(within(card).getByRole("link", { name: t.chatProposalOpen })).toHaveAttribute("href", "/projects/p1/backlog?pbi=pb-98")
      expect(calls((u) => u === "/api/projects/p1/backlog")).toHaveLength(0)
    })

    it("releases the reservation when creating fails, so the user can retry", async () => {
      stub([CREATE], (url, init) => {
        if (url === OUTCOME_URL) return jsonResponse({ outcome: null })
        if (url === "/api/projects/p1/backlog" && init?.method === "POST") return jsonResponse({ error: "boom" }, 500)
        return threadStream(url)
      })
      const { user, card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
      const approve = within(card).getByRole("button", { name: t.chatProposalApproveCreate })
      await waitFor(() => expect(approve).toBeEnabled())
      await user.click(approve)
      await waitFor(() => expect(calls((u) => u === OUTCOME_URL)).toHaveLength(2))
      expect(bodyOf(calls((u) => u === OUTCOME_URL)[1][1] as RequestInit)).toEqual({ action: "release" })
      await waitFor(() => expect(within(card).getByRole("button", { name: t.chatProposalApproveCreate })).toBeEnabled())
    })

    it("records a rejection", async () => {
      stub([CREATE], (url) => (url === OUTCOME_URL ? jsonResponse({ outcome: null }) : threadStream(url)))
      const { user, card } = await askAndGetCard(t.chatProposalCreatePbiTitle)
      await user.click(within(card).getByRole("button", { name: t.chatProposalReject }))
      await waitFor(() => expect(calls((u) => u === OUTCOME_URL)).toHaveLength(1))
      expect(bodyOf(calls((u) => u === OUTCOME_URL)[0][1] as RequestInit)).toEqual({ action: "reject" })
      expect(within(card).getByText(t.chatProposalRejected)).toBeInTheDocument()
    })
  })

  it("does not fetch members when the answer has no proposals", async () => {
    stub([])
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await user.type(screen.getByRole("textbox", { name: t.chatInputLabel }), "hi")
    await user.click(screen.getByRole("button", { name: t.chatSend }))
    await screen.findByText(/提案します。/)
    expect(calls((u) => u.endsWith("/members"))).toHaveLength(0)
    expect(screen.queryByRole("heading", { name: t.chatProposalCreatePbiTitle })).not.toBeInTheDocument()
  })
})
