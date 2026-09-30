import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { encodeChatEvent, type ChatProposal } from "@/lib/chat-proposals"
import { jsonResponse, renderWithProviders } from "../../gantt/__tests__/providers"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock("next-auth/react", () => ({ useSession: () => ({ data: { user: { id: "u1", role: "member" } } }) }))
vi.mock("next/dynamic", () => ({ default: () => () => null }))

const { default: ChatPage } = await import("../page")
const t = getTranslations("ja")

const T1 = { id: "t1", title: "Sprint status", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-02T00:00:00.000Z" }
const T2 = { id: "t2", title: "Velocity", createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z" }

type Route = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined
let threads: typeof T1[]
let fetchMock: ReturnType<typeof vi.fn>

function stub(extra: Route = () => undefined) {
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? "GET"
    const custom = await extra(url, init)
    if (custom) return custom
    if (url === "/api/projects/p1/chat/threads" && method === "GET") return jsonResponse({ items: threads, nextCursor: null })
    if (url === "/api/projects/p1/chat/threads/t1" && method === "GET") {
      return jsonResponse({
        thread: T1,
        messages: [
          { id: "m1", role: "user", content: "How is the sprint?", partial: false, createdAt: "" },
          { id: "m2", role: "assistant", content: "Mostly on track", partial: true, createdAt: "" },
        ],
      })
    }
    if (url === "/api/projects/p1/chat" && method === "POST") {
      return new Response("New answer", { status: 200, headers: { "content-type": "text/plain", "X-Chat-Thread-Id": "t-new" } })
    }
    return jsonResponse({ error: "unexpected" }, 500)
  })
  vi.stubGlobal("fetch", fetchMock)
}

const calls = (method: string, url: string) =>
  fetchMock.mock.calls.filter(([u, i]) => String(u) === url && ((i as RequestInit | undefined)?.method ?? "GET") === method)
const log = () => screen.getByRole("log", { name: t.chatConversationLabel })
const nav = () => screen.getByRole("navigation", { name: t.chatThreadsTitle })

beforeEach(() => {
  threads = [T1, T2]
  window.history.replaceState(null, "", "/projects/p1/chat")
})
afterEach(() => vi.unstubAllGlobals())

describe("chat history", () => {
  it("lists my threads and opens one: messages load and ?thread= is set", async () => {
    stub()
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await user.click(await within(nav()).findByRole("button", { name: /^Sprint status/ }))
    expect(await within(log()).findByText("Mostly on track")).toBeInTheDocument()
    expect(within(log()).getByText("How is the sprint?")).toBeInTheDocument()
    expect(within(log()).getByText(t.chatStopped)).toBeInTheDocument()
    expect(window.location.search).toBe("?thread=t1")
    expect(within(nav()).getByRole("button", { name: /^Sprint status/ })).toHaveAttribute("aria-current", "page")
  })

  it("resumes the thread named in the URL and continues it", async () => {
    window.history.replaceState(null, "", "/projects/p1/chat?thread=t1")
    stub()
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    expect(await within(log()).findByText("Mostly on track")).toBeInTheDocument()

    await user.type(screen.getByRole("textbox", { name: t.chatInputLabel }), "And next week?")
    await user.click(screen.getByRole("button", { name: t.chatSend }))
    await waitFor(() => expect(calls("POST", "/api/projects/p1/chat")).toHaveLength(1))
    const body = JSON.parse(String((calls("POST", "/api/projects/p1/chat")[0][1] as RequestInit).body))
    expect(body.threadId).toBe("t1")
    expect(body.messages).toEqual([
      { role: "user", content: "How is the sprint?" },
      { role: "assistant", content: "Mostly on track" },
      { role: "user", content: "And next week?" },
    ])
  })

  it("a new chat adopts the thread id the server assigned and refreshes the list", async () => {
    stub()
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await within(nav()).findByRole("button", { name: /^Sprint status/ })
    const listCallsBefore = calls("GET", "/api/projects/p1/chat/threads").length

    await user.type(screen.getByRole("textbox", { name: t.chatInputLabel }), "Hello")
    await user.click(screen.getByRole("button", { name: t.chatSend }))
    expect(await within(log()).findByText("New answer")).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe("?thread=t-new"))
    const first = JSON.parse(String((calls("POST", "/api/projects/p1/chat")[0][1] as RequestInit).body))
    expect(first.threadId).toBeUndefined()
    await waitFor(() => expect(calls("GET", "/api/projects/p1/chat/threads").length).toBeGreaterThan(listCallsBefore))
    // The answer on screen is kept (the new thread is not reloaded from the server).
    expect(calls("GET", "/api/projects/p1/chat/threads/t-new")).toHaveLength(0)

    await user.type(screen.getByRole("textbox", { name: t.chatInputLabel }), "More")
    await user.click(screen.getByRole("button", { name: t.chatSend }))
    await waitFor(() => expect(calls("POST", "/api/projects/p1/chat")).toHaveLength(2))
    expect(JSON.parse(String((calls("POST", "/api/projects/p1/chat")[1][1] as RequestInit).body)).threadId).toBe("t-new")
  })

  it("new chat empties the view and clears ?thread=", async () => {
    window.history.replaceState(null, "", "/projects/p1/chat?thread=t1")
    stub()
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    expect(await within(log()).findByText("Mostly on track")).toBeInTheDocument()
    await user.click(within(nav()).getByRole("button", { name: t.chatNewChat }))
    expect(within(log()).queryByText("Mostly on track")).not.toBeInTheDocument()
    expect(window.location.search).toBe("")
  })

  it("renames a thread", async () => {
    stub((url, init) =>
      url === "/api/projects/p1/chat/threads/t2" && init?.method === "PATCH" ? jsonResponse({ ...T2, title: "Speed" }) : undefined,
    )
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await user.click(await within(nav()).findByRole("button", { name: `${t.chatThreadRename}: Velocity` }))
    const field = within(nav()).getByRole("textbox", { name: t.chatThreadRenameLabel })
    await user.clear(field)
    await user.type(field, "Speed")
    await user.click(within(nav()).getByRole("button", { name: t.chatThreadSave }))
    expect(await within(nav()).findByRole("button", { name: /^Speed/ })).toBeInTheDocument()
    expect(JSON.parse(String((calls("PATCH", "/api/projects/p1/chat/threads/t2")[0][1] as RequestInit).body))).toEqual({ title: "Speed" })
  })

  it("deleting the open thread asks first, then starts a new chat", async () => {
    window.history.replaceState(null, "", "/projects/p1/chat?thread=t1")
    stub((url, init) =>
      url === "/api/projects/p1/chat/threads/t1" && init?.method === "DELETE" ? jsonResponse({ success: true }) : undefined,
    )
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    expect(await within(log()).findByText("Mostly on track")).toBeInTheDocument()
    await user.click(within(nav()).getByRole("button", { name: `${t.chatThreadDelete}: Sprint status` }))
    const dialog = await screen.findByRole("alertdialog").catch(() => screen.findByRole("dialog"))
    await user.click(within(dialog).getByRole("button", { name: t.chatThreadDelete }))
    await waitFor(() => expect(calls("DELETE", "/api/projects/p1/chat/threads/t1")).toHaveLength(1))
    await waitFor(() => expect(within(nav()).queryByRole("button", { name: /^Sprint status/ })).not.toBeInTheDocument())
    expect(window.location.search).toBe("")
    expect(within(log()).queryByText("Mostly on track")).not.toBeInTheDocument()
  })

  it("a thread that is gone (404) shows an error and falls back to a new chat", async () => {
    window.history.replaceState(null, "", "/projects/p1/chat?thread=gone")
    stub((url) => (url === "/api/projects/p1/chat/threads/gone" ? jsonResponse({ error: "Not found", code: "NOT_FOUND" }, 404) : undefined))
    renderWithProviders(<ChatPage />)
    expect(await screen.findByText(t.chatThreadLoadFailed)).toBeInTheDocument()
    await waitFor(() => expect(window.location.search).toBe(""))
  })

  it("a re-opened thread keeps an applied proposal applied (P-02: no second approve)", async () => {
    const proposal: ChatProposal = {
      kind: "create_pbi", proposalId: "prop_x", title: "SSO", userStory: "", acceptanceCriteria: "",
      storyPoints: null, epic: null, reason: "", possibleDuplicates: [],
    }
    const outcome = { status: "applied", appliedEntityId: "pb-98", at: "2026-10-01T00:00:00.000Z", by: "u1" }
    window.history.replaceState(null, "", "/projects/p1/chat?thread=t2")
    stub((url, init) =>
      url === "/api/projects/p1/chat/threads/t2" && (init?.method ?? "GET") === "GET"
        ? jsonResponse({
            thread: T2,
            messages: [
              {
                id: "a1", role: "assistant", content: `Proposed${encodeChatEvent({ type: "proposal", proposal })}`,
                partial: false, createdAt: "", toolEvents: [{ type: "proposal", proposal, outcome }],
              },
            ],
          })
        : undefined,
    )
    renderWithProviders(<ChatPage />)
    const card = (await screen.findByRole("heading", { name: t.chatProposalCreatePbiTitle })).closest("section") as HTMLElement
    expect(within(card).getByText(t.chatProposalApplied)).toBeInTheDocument()
    expect(within(card).queryByRole("button", { name: t.chatProposalApproveCreate })).not.toBeInTheDocument()
    expect(within(card).getByRole("link", { name: t.chatProposalOpen })).toHaveAttribute("href", "/projects/p1/backlog?pbi=pb-98")
  })

  it("shows the empty-history hint", async () => {
    threads = []
    stub()
    renderWithProviders(<ChatPage />)
    expect(await within(nav()).findByText(t.chatThreadsEmpty)).toBeInTheDocument()
  })
})
