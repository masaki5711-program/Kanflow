import { Suspense, lazy, type ComponentType } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders } from "../../gantt/__tests__/providers"

vi.mock("next/navigation", () => ({ useParams: () => ({ projectId: "p1" }) }))
// next/dynamic → React.lazy + Suspense with the provided loading fallback.
vi.mock("next/dynamic", () => ({
  default: (loader: () => Promise<{ default: ComponentType<unknown> }>, opts?: { loading?: ComponentType }) => {
    const Lazy = lazy(loader)
    const Loading = opts?.loading
    return function Dynamic(props: Record<string, unknown>) {
      return (
        <Suspense fallback={Loading ? <Loading /> : null}>
          <Lazy {...props} />
        </Suspense>
      )
    }
  },
}))
vi.mock("../chat-chart", () => ({
  default: ({ spec }: { spec: { title?: string } }) => <div data-testid="chat-chart">{spec.title}</div>,
}))

const { default: ChatPage } = await import("../page")
const t = getTranslations("ja")

/** A manually driven streaming body; errors with AbortError when the request signal aborts. */
function controllableStream(signal?: AbortSignal | null) {
  let ctrl!: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      ctrl = c
    },
  })
  signal?.addEventListener("abort", () => {
    try {
      ctrl.error(new DOMException("The operation was aborted.", "AbortError"))
    } catch {
      // already closed
    }
  })
  const enc = new TextEncoder()
  return {
    response: new Response(stream, { status: 200, headers: { "content-type": "text/plain" } }),
    push: (s: string) => ctrl.enqueue(enc.encode(s)),
    close: () => ctrl.close(),
  }
}

type Stream = ReturnType<typeof controllableStream>
let streams: Stream[]
let fetchMock: ReturnType<typeof vi.fn>

function useStreamingFetch() {
  streams = []
  fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    const s = controllableStream(init?.signal)
    streams.push(s)
    return Promise.resolve(s.response)
  })
  // The chat-history sidebar (GET /chat/threads) answers an empty list;
  // `fetchMock` only sees the chat requests.
  vi.stubGlobal("fetch", (url: string, init?: RequestInit) =>
    String(url).includes("/chat/threads")
      ? Promise.resolve(jsonResponse({ items: [], nextCursor: null }))
      : fetchMock(url, init),
  )
}

beforeEach(() => useStreamingFetch())
afterEach(() => vi.unstubAllGlobals())

const log = () => screen.getByRole("log", { name: t.chatConversationLabel })
const input = () => screen.getByRole("textbox", { name: t.chatInputLabel })

async function ask(user: ReturnType<typeof userEvent.setup>, text: string) {
  await user.type(input(), text)
  await user.click(screen.getByRole("button", { name: t.chatSend }))
}

describe("ChatPage", () => {
  it("shows the empty state and a disabled send button initially", () => {
    renderWithProviders(<ChatPage />)
    expect(screen.getByText(t.chatEmpty)).toBeInTheDocument()
    expect(log()).toHaveAttribute("aria-live", "polite")
    expect(log()).toHaveAttribute("aria-busy", "false")
    expect(screen.getByRole("button", { name: t.chatSend })).toBeDisabled()
    expect(screen.queryByRole("button", { name: t.chatClear })).not.toBeInTheDocument()
  })

  it("streams the answer chunk by chunk with aria-busy and a thinking status", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await ask(user, "  How is the sprint?  ")

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/projects/p1/chat")
    expect(init.method).toBe("POST")
    expect(JSON.parse(init.body)).toEqual({ messages: [{ role: "user", content: "How is the sprint?" }], lang: "ja" })

    // waiting for first token
    expect(log()).toHaveAttribute("aria-busy", "true")
    expect(within(log()).getByText("How is the sprint?")).toBeInTheDocument()
    expect(screen.getAllByRole("status").some((s) => s.textContent === t.chatThinking)).toBe(true)
    expect(input()).toBeDisabled()
    expect(input()).toHaveValue("")
    expect(screen.getByRole("button", { name: t.chatCancel })).toBeInTheDocument()

    await act(async () => streams[0].push("Going "))
    expect(await within(log()).findByText("Going")).toBeInTheDocument()
    expect(screen.getAllByRole("status").some((s) => s.textContent === t.chatThinking)).toBe(false)
    await act(async () => streams[0].push("**well**"))
    expect(await within(log()).findByText("well")).toBeInTheDocument()
    expect(log()).toHaveAttribute("aria-busy", "true")

    await act(async () => streams[0].close())
    await waitFor(() => expect(log()).toHaveAttribute("aria-busy", "false"))
    expect(screen.getByRole("button", { name: t.chatSend })).toBeInTheDocument()
    expect(input()).not.toBeDisabled()
    await waitFor(() => expect(input()).toHaveFocus())
    expect(screen.queryByText(t.chatStopped)).not.toBeInTheDocument()
  })

  it("sends the full history on follow-up questions and sends with Enter (not Shift+Enter)", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await ask(user, "Q1")
    await waitFor(() => expect(streams).toHaveLength(1))
    await act(async () => {
      streams[0].push("A1")
      streams[0].close()
    })
    await waitFor(() => expect(log()).toHaveAttribute("aria-busy", "false"))

    await user.type(input(), "line1{Shift>}{Enter}{/Shift}line2")
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(input()).toHaveValue("line1\nline2")
    await user.keyboard("{Enter}")
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).messages).toEqual([
      { role: "user", content: "Q1" },
      { role: "assistant", content: "A1" },
      { role: "user", content: "line1\nline2" },
    ])
  })

  it("stop aborts the request, keeps the partial answer and returns to idle", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await ask(user, "Long question")
    await waitFor(() => expect(streams).toHaveLength(1))
    await act(async () => streams[0].push("Partial answer"))
    await within(log()).findByText("Partial answer")

    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    expect(signal.aborted).toBe(false)
    await user.click(screen.getByRole("button", { name: t.chatCancel }))

    expect(signal.aborted).toBe(true)
    await waitFor(() => expect(log()).toHaveAttribute("aria-busy", "false"))
    expect(within(log()).getByText("Partial answer")).toBeInTheDocument()
    expect(within(log()).getByText(t.chatStopped)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.chatSend })).toBeInTheDocument()
    expect(screen.queryByText(t.chatError)).toBeNull()
  })

  it("clear aborts in-flight generation and empties the conversation", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await ask(user, "Hello")
    await waitFor(() => expect(streams).toHaveLength(1))
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    await user.click(screen.getByRole("button", { name: t.chatClear }))
    expect(signal.aborted).toBe(true)
    await waitFor(() => expect(screen.getByText(t.chatEmpty)).toBeInTheDocument())
    await waitFor(() => expect(log()).toHaveAttribute("aria-busy", "false"))
  })

  it("aborts the in-flight request on unmount", async () => {
    const user = userEvent.setup()
    const { unmount } = renderWithProviders(<ChatPage />)
    await ask(user, "Hello")
    await waitFor(() => expect(streams).toHaveLength(1))
    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal
    unmount()
    expect(signal.aborted).toBe(true)
  })

  it("on server error shows an alert and toast, drops the turn and restores the question", async () => {
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse({ error: "LLM is down" }, 503)))
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await ask(user, "Will it fail?")

    expect(await screen.findByText("LLM is down")).toBeInTheDocument()
    const alerts = screen.getAllByRole("alert")
    expect(alerts.some((a) => a.textContent?.includes(t.chatError))).toBe(true)
    await waitFor(() => expect(input()).toHaveValue("Will it fail?"))
    expect(screen.getByText(t.chatEmpty)).toBeInTheDocument()
    expect(log()).toHaveAttribute("aria-busy", "false")
  })

  it("handles plain-text error bodies and network failures", async () => {
    fetchMock
      .mockImplementationOnce(() => Promise.resolve(new Response("upstream exploded", { status: 500 })))
      .mockImplementationOnce(() => Promise.reject(new TypeError("")))
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await ask(user, "one")
    expect(await screen.findByText("upstream exploded")).toBeInTheDocument()

    await waitFor(() => expect(input()).toHaveValue("one"))
    await user.click(screen.getByRole("button", { name: t.chatSend }))
    // empty error message → falls back to the error title in the toast
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(input()).toHaveValue("one"))
    expect(screen.getAllByText(t.chatError).length).toBeGreaterThan(0)
  })

  it("renders assistant markdown including tables, code, links and chart blocks", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await ask(user, "Report please")
    await waitFor(() => expect(streams).toHaveLength(1))
    const md = [
      "# Title",
      "## Sub",
      "### Minor",
      "#### Deep",
      "##### Deeper",
      "Some *em* and **strong** and `inline`.",
      "",
      "- item a",
      "- item b",
      "",
      "1. first",
      "",
      "> quoted",
      "",
      "---",
      "",
      "[docs](https://example.com)",
      "",
      "| h1 | h2 |",
      "| -- | -- |",
      "| c1 | c2 |",
      "",
      "```ts",
      "const x = 1",
      "```",
      "",
      "```chart",
      JSON.stringify({ type: "bar", title: "Velocity chart", x: "s", series: [{ key: "v" }], data: [{ s: "S1", v: 3 }] }),
      "```",
      "",
      "```chart",
      "{ not json",
      "```",
    ].join("\n")
    await act(async () => {
      streams[0].push(md)
      streams[0].close()
    })

    const l = log()
    // AI markdown headings are demoted below the page h1 (h1→h3, h2→h4, h3→h5).
    expect(await within(l).findByRole("heading", { level: 3, name: "Title" })).toBeInTheDocument()
    expect(within(l).getByRole("heading", { level: 4, name: "Sub" })).toBeInTheDocument()
    expect(within(l).getByRole("heading", { level: 5, name: "Minor" })).toBeInTheDocument()
    expect(within(l).getByRole("heading", { level: 6, name: "Deep" })).toBeInTheDocument()
    expect(within(l).getByRole("heading", { level: 6, name: "Deeper" })).toBeInTheDocument()
    expect(within(l).queryByRole("heading", { level: 1 })).not.toBeInTheDocument()
    expect(within(l).getByText("em").tagName).toBe("EM")
    expect(within(l).getByText("strong").tagName).toBe("STRONG")
    expect(within(l).getByText("inline").tagName).toBe("CODE")
    expect(within(l).getAllByRole("listitem")).toHaveLength(3)
    expect(within(l).getByText("quoted").closest("blockquote")).not.toBeNull()
    expect(within(l).getByRole("link", { name: "docs" })).toHaveAttribute("target", "_blank")
    expect(within(l).getByRole("table")).toBeInTheDocument()
    expect(within(l).getByRole("columnheader", { name: "h1" })).toBeInTheDocument()
    expect(within(l).getByRole("cell", { name: "c2" })).toBeInTheDocument()
    expect(within(l).getByText("const x = 1").closest("pre")).not.toBeNull()
    expect(await within(l).findByTestId("chat-chart")).toHaveTextContent("Velocity chart")
    expect(within(l).getByText("{ not json").closest("pre")).not.toBeNull()
    // screen-reader speaker labels
    expect(within(l).getByText(`${t.chatYou}:`, { exact: false })).toBeInTheDocument()
    expect(within(l).getByText(`${t.chatAssistant}:`, { exact: false })).toBeInTheDocument()
  })

  it("ignores whitespace-only input", async () => {
    const user = userEvent.setup()
    renderWithProviders(<ChatPage />)
    await user.type(input(), "   {Enter}")
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
