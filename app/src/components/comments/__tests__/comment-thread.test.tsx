import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { jsonResponse, renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import { CommentThread } from "../comment-thread"
import type { CommentDto } from "../types"

stubLayout()

const t = getTranslations("en")
const BASE = "/api/projects/p1/comments"
const LIST = `${BASE}?entityType=pbi&entityId=b1`

function comment(id: string, over: Partial<CommentDto> = {}): CommentDto {
  return {
    id,
    entityType: "pbi",
    entityId: "b1",
    author: { id: "u1", name: "Alice" },
    body: `Body ${id}`,
    deleted: false,
    mentions: [],
    createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
    editedAt: null,
    canEdit: false,
    canDelete: false,
    ...over,
  }
}

type Handler = (init: RequestInit | undefined) => Response | Promise<Response>
let routes: Record<string, Handler>
let calls: { method: string; url: string; body: unknown }[]

beforeEach(() => {
  calls = []
  routes = {
    [`GET /api/projects/p1/members`]: () => jsonResponse([{ userId: "u2", user: { name: "Taro Yamada" } }]),
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const method = (init?.method ?? "GET").toUpperCase()
      const url = String(input)
      calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined })
      const handler = routes[`${method} ${url}`]
      return handler ? handler(init) : jsonResponse({ error: `no route ${method} ${url}` }, 404)
    }),
  )
})
afterEach(() => vi.unstubAllGlobals())

function renderThread() {
  const onCountDelta = vi.fn()
  renderWithProviders(<CommentThread projectId="p1" entityType="pbi" entityId="b1" onCountDelta={onCountDelta} />)
  return { onCountDelta }
}

describe("CommentThread", () => {
  it("shows the empty state, then posts a comment that appears at the end", async () => {
    routes[`GET ${LIST}`] = () => jsonResponse({ items: [], nextCursor: null })
    routes[`POST ${BASE}`] = () =>
      jsonResponse(comment("new", { body: "Hi @[Taro Yamada]", mentions: [{ id: "u2", name: "Taro Yamada" }], canEdit: true, canDelete: true }), 201)
    const { onCountDelta } = renderThread()
    expect(await screen.findByText(t.commentsEmptyTitle)).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(t.commentsBodyLabel), "Hi @Taro")
    await userEvent.keyboard("{Enter}")
    await userEvent.click(screen.getByRole("button", { name: t.commentsSend }))

    expect(await screen.findByText("@Taro Yamada")).toHaveAttribute("data-mention")
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ entityType: "pbi", entityId: "b1", body: "Hi @[Taro Yamada]" })
    expect(onCountDelta).toHaveBeenCalledWith(1)
    expect(screen.queryByText(t.commentsEmptyTitle)).not.toBeInTheDocument()
    expect(screen.getByLabelText(t.commentsBodyLabel)).toHaveValue("")
  })

  it("renders bodies as plain text with line breaks, safe links and relative times", async () => {
    routes[`GET ${LIST}`] = () =>
      jsonResponse({
        items: [comment("a", { body: "<b>bold</b>\nline 2 https://example.com/x", editedAt: new Date().toISOString() })],
        nextCursor: null,
      })
    renderThread()
    const item = (await screen.findByText(/<b>bold<\/b>/)).closest("li")!
    expect(item.querySelector("b")).toBeNull()
    expect(within(item).getByText(/line 2/).closest("p")).toHaveClass("whitespace-pre-wrap")
    const link = within(item).getByRole("link", { name: "https://example.com/x" })
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow")
    expect(link).toHaveAttribute("target", "_blank")
    expect(within(item).getByText("5 minutes ago")).toBeInTheDocument()
    expect(within(item).getByText(t.commentsEdited)).toBeInTheDocument()
    // bare @tokens that are not resolved mentions are not highlighted
    expect(item.querySelector("[data-mention]")).toBeNull()
  })

  it("shows tombstones and no actions for others' comments", async () => {
    routes[`GET ${LIST}`] = () =>
      jsonResponse({ items: [comment("a", { deleted: true, body: null, author: null }), comment("b")], nextCursor: null })
    renderThread()
    expect(await screen.findByText(t.commentsDeletedBody)).toBeInTheDocument()
    expect(screen.getByText(t.commentsUnknownUser)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.commentsEdit })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: t.commentsDelete })).not.toBeInTheDocument()
  })

  it("edits one's own comment", async () => {
    routes[`GET ${LIST}`] = () => jsonResponse({ items: [comment("a", { canEdit: true, canDelete: true })], nextCursor: null })
    routes[`PATCH ${BASE}/a`] = () => jsonResponse(comment("a", { body: "Updated", editedAt: new Date().toISOString(), canEdit: true, canDelete: true }))
    renderThread()
    await userEvent.click(await screen.findByRole("button", { name: t.commentsEdit }))
    const box = screen.getByLabelText(t.commentsEditBodyLabel)
    await userEvent.clear(box)
    await userEvent.type(box, "Updated")
    await userEvent.click(screen.getByRole("button", { name: t.commentsSave }))
    expect(await screen.findByText("Updated")).toBeInTheDocument()
    expect(screen.queryByLabelText(t.commentsEditBodyLabel)).not.toBeInTheDocument()
    expect(calls.find((c) => c.method === "PATCH")?.body).toEqual({ body: "Updated" })
  })

  it("keeps the editor open and toasts when saving fails; cancel closes it", async () => {
    routes[`GET ${LIST}`] = () => jsonResponse({ items: [comment("a", { canEdit: true })], nextCursor: null })
    routes[`PATCH ${BASE}/a`] = () => jsonResponse({ error: "nope" }, 403)
    renderThread()
    await userEvent.click(await screen.findByRole("button", { name: t.commentsEdit }))
    await userEvent.type(screen.getByLabelText(t.commentsEditBodyLabel), "!")
    await userEvent.click(screen.getByRole("button", { name: t.commentsSave }))
    expect(await screen.findByText("nope")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.commentsCancel }))
    expect(screen.getByText("Body a")).toBeInTheDocument()
  })

  it("deletes after confirmation and leaves a tombstone", async () => {
    routes[`GET ${LIST}`] = () => jsonResponse({ items: [comment("a", { canDelete: true })], nextCursor: null })
    routes[`DELETE ${BASE}/a`] = () => jsonResponse({ success: true })
    const { onCountDelta } = renderThread()
    await userEvent.click(await screen.findByRole("button", { name: t.commentsDelete }))
    const dialog = await screen.findByRole("alertdialog")
    expect(within(dialog).getByText(t.commentsDeleteConfirmTitle)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole("button", { name: t.commentsDelete }))
    expect(await screen.findByText(t.commentsDeletedBody)).toBeInTheDocument()
    expect(onCountDelta).toHaveBeenCalledWith(-1)
    expect(await screen.findByText(t.commentsDeleteDone)).toBeInTheDocument()
  })

  it("does nothing when the delete is cancelled; toasts a failed delete", async () => {
    routes[`GET ${LIST}`] = () => jsonResponse({ items: [comment("a", { canDelete: true })], nextCursor: null })
    routes[`DELETE ${BASE}/a`] = () => jsonResponse({ error: "gone" }, 404)
    renderThread()
    await userEvent.click(await screen.findByRole("button", { name: t.commentsDelete }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Cancel" }))
    expect(calls.some((c) => c.method === "DELETE")).toBe(false)
    await userEvent.click(screen.getByRole("button", { name: t.commentsDelete }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.commentsDelete }))
    expect(await screen.findByText("gone")).toBeInTheDocument()
    expect(screen.getByText("Body a")).toBeInTheDocument()
  })

  it("loads more pages (oldest first) without duplicates", async () => {
    routes[`GET ${LIST}`] = () => jsonResponse({ items: [comment("a"), comment("b")], nextCursor: "CUR" })
    routes[`GET ${LIST}&cursor=CUR`] = () => jsonResponse({ items: [comment("b"), comment("c")], nextCursor: null })
    renderThread()
    await userEvent.click(await screen.findByRole("button", { name: t.commentsLoadMore }))
    expect(await screen.findByText("Body c")).toBeInTheDocument()
    expect(screen.getAllByText(/^Body /).map((n) => n.textContent)).toEqual(["Body a", "Body b", "Body c"])
    expect(screen.queryByRole("button", { name: t.commentsLoadMore })).not.toBeInTheDocument()
  })

  it("toasts a failed load-more and a failed post", async () => {
    routes[`GET ${LIST}`] = () => jsonResponse({ items: [comment("a")], nextCursor: "CUR" })
    routes[`GET ${LIST}&cursor=CUR`] = () => jsonResponse({ error: "boom" }, 500)
    routes[`POST ${BASE}`] = () => jsonResponse({ error: "forbidden" }, 403)
    renderThread()
    await userEvent.click(await screen.findByRole("button", { name: t.commentsLoadMore }))
    expect(await screen.findByText("boom")).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(t.commentsBodyLabel), "x")
    await userEvent.click(screen.getByRole("button", { name: t.commentsSend }))
    expect(await screen.findByText("forbidden")).toBeInTheDocument()
    expect(screen.getByLabelText(t.commentsBodyLabel)).toHaveValue("x")
  })

  it("shows an error state with retry", async () => {
    let fail = true
    routes[`GET ${LIST}`] = () => (fail ? jsonResponse({ error: "Comment target not found" }, 404) : jsonResponse({ items: [], nextCursor: null }))
    renderThread()
    expect(await screen.findByText("Comment target not found")).toBeInTheDocument()
    fail = false
    await userEvent.click(screen.getByRole("button", { name: t.commentsRetry }))
    expect(await screen.findByText(t.commentsEmptyTitle)).toBeInTheDocument()
  })
})
