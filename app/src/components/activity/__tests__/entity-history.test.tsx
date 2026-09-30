import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders } from "@/components/__tests__/helpers"
import { EntityHistory } from "../entity-history"
import { actionSentence, parseActivityPage } from "../history-format"

const t = getTranslations("en")
const URL = "/api/projects/p1/activity/pbi/b1"
const recent = new Date(Date.now() - 2 * 3_600_000).toISOString()

function entry(id: string, over: Record<string, unknown> = {}) {
  return { id, action: "update", actor: { id: "u1", name: "Alice" }, changes: null, label: "Story", meta: null, createdAt: recent, ...over }
}

let routes: Record<string, () => Response>
beforeEach(() => {
  routes = {}
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => routes[String(input)]?.() ?? jsonResponse({ error: "no route" }, 404)))
})
afterEach(() => vi.unstubAllGlobals())

const LABELS = { status: "Status", userStory: "User story" }
const fmt = (field: string, v: string | number | boolean) => (field === "status" && v === "ready" ? "Ready" : String(v))

function renderHistory() {
  return renderWithProviders(<EntityHistory projectId="p1" entityType="pbi" entityId="b1" fieldLabels={LABELS} formatValue={fmt} />)
}

describe("EntityHistory", () => {
  it("renders readable entries with localized field labels and values", async () => {
    routes[URL] = () =>
      jsonResponse({
        items: [
          entry("a", { action: "status_change", changes: { status: { from: "not_ready", to: "ready" } } }),
          entry("b", { action: "update", changes: { userStory: { changed: true }, epic: { from: null, to: "E" } } }),
          entry("c", { action: "comment", actor: null }),
        ],
        nextCursor: null,
      })
    renderHistory()
    expect(await screen.findByText("Alice changed the status")).toBeInTheDocument()
    expect(screen.getByText("not_ready → Ready", { exact: false })).toBeInTheDocument()
    expect(screen.getByText("User story")).toBeInTheDocument()
    expect(screen.getByText(`${t.historyEmptyValue} → E`, { exact: false })).toBeInTheDocument()
    // an unknown field shows its raw name
    expect(screen.getByText("epic")).toBeInTheDocument()
    expect(screen.getByText(`${t.historySystem} commented`)).toBeInTheDocument()
    expect(screen.getAllByText("2 hours ago")).toHaveLength(3)
  })

  it("loads more", async () => {
    routes[URL] = () => jsonResponse({ items: [entry("a", { action: "create" })], nextCursor: "C1" })
    routes[`${URL}?cursor=C1`] = () => jsonResponse({ items: [entry("b", { action: "restore" })], nextCursor: null })
    renderHistory()
    await userEvent.click(await screen.findByRole("button", { name: t.historyLoadMore }))
    expect(await screen.findByText("Alice restored this from the trash")).toBeInTheDocument()
    expect(screen.getByText("Alice created this")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.historyLoadMore })).not.toBeInTheDocument()
  })

  it("toasts a failed load-more", async () => {
    routes[URL] = () => jsonResponse({ items: [entry("a")], nextCursor: "C1" })
    routes[`${URL}?cursor=C1`] = () => jsonResponse({ error: "boom" }, 500)
    renderHistory()
    await userEvent.click(await screen.findByRole("button", { name: t.historyLoadMore }))
    expect(await screen.findByText("boom")).toBeInTheDocument()
  })

  it("empty state", async () => {
    routes[URL] = () => jsonResponse({ items: [], nextCursor: null })
    renderWithProviders(<EntityHistory projectId="p1" entityType="pbi" entityId="b1" fieldLabels={{}} />)
    expect(await screen.findByText(t.historyEmpty)).toBeInTheDocument()
  })

  it("error state with retry; long values are cut", async () => {
    routes[URL] = () => jsonResponse({ error: "denied" }, 500)
    renderHistory()
    expect(await screen.findByText("denied")).toBeInTheDocument()
    routes[URL] = () =>
      jsonResponse({ items: [entry("z", { action: "delete", changes: { status: { from: "x", to: "y".repeat(100) } } })], nextCursor: null })
    await userEvent.click(screen.getByRole("button", { name: t.commentsRetry }))
    expect(await screen.findByText("Alice deleted this")).toBeInTheDocument()
    expect(screen.getByText(/y{10,}…$/)).toBeInTheDocument()
  })
})

describe("history-format", () => {
  it("parses tolerant pages and builds sentences", () => {
    expect(parseActivityPage({ items: [entry("a"), { id: 1 }], nextCursor: 3 })).toEqual({ items: [entry("a")], nextCursor: null })
    expect(parseActivityPage(null)).toEqual({ items: [], nextCursor: null })
    expect(actionSentence({ action: "assign", actor: { id: "u", name: "Bo" } }, t)).toBe("Bo changed the assignee")
    expect(actionSentence({ action: "move", actor: { id: null, name: null } }, t)).toBe("System moved this between sprints")
    expect(actionSentence({ action: "weird", actor: null }, t)).toBe("System updated this")
  })
})
