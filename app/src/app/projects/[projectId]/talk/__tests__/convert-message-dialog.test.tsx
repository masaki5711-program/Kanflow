import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { ConvertMessageDialog, convertPayload, titleOf } from "../convert-message-dialog"
import { MessageItem } from "../message-item"
import type { TeamMessage } from "../types"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const t = tr("ja")

function msg(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: "m1",
    author: { id: "u1", name: "Alice" },
    body: "ログイン画面を直したい\n詳細: パスワード再設定が分かりにくい",
    createdAt: "2026-01-01T00:00:00Z",
    editedAt: null,
    mentions: [],
    mentionsMe: false,
    repliesToMe: false,
    attachments: [],
    source: null,
    replyTo: null,
    postedToThread: false,
    canDelete: false,
    ...overrides,
  }
}

afterEach(() => vi.unstubAllGlobals())

describe("convertPayload", () => {
  it("builds a PBI from the first line (title) and the whole text, linking back to the message", () => {
    expect(convertPayload("pbi", " 件名\n本文 ", "http://x/talk?message=m1", "元", "Alice")).toEqual({
      initiative: "件名",
      userStory: "件名\n本文",
      referenceDoc: "元: http://x/talk?message=m1",
    })
  })

  it("builds an Icebox request with the author and the link as background", () => {
    expect(convertPayload("icebox", "要望", "http://x", "元", "Alice")).toEqual({ request: "要望", background: "元: http://x", author: "Alice" })
  })

  it("keeps a long first line within the title limit", () => {
    expect(titleOf("あ".repeat(300)).length).toBe(200)
  })
})

describe("ConvertMessageDialog", () => {
  it("posts the edited text to the backlog API and closes", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "pb1" }), { status: 201, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const onClose = vi.fn()
    renderWithProviders(<ConvertMessageDialog projectId="p1" message={msg()} canPbi canIcebox canTask onClose={onClose} />)

    await userEvent.click(screen.getByTestId("talk-convert-submit"))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe("/api/projects/p1/backlog")
    expect(init.method).toBe("POST")
    expect(JSON.parse(String(init.body))).toMatchObject({ initiative: "ログイン画面を直したい" })
  })

  it("adds a sprint task: running sprint first, PBI picker, first line as the task name", async () => {
    const sprints = [
      { id: "s0", sprintName: "Done one", status: "done", items: [] },
      { id: "s2", sprintName: "Next", status: "planning", items: [] },
      { id: "s1", sprintName: "Now", status: "active", items: [{ pbItem: { id: "pb1", displayId: 4, initiative: "ログイン" } }, { pbItem: { id: "pb1", displayId: 4, initiative: "ログイン" } }] },
    ]
    const fetchMock = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith("/sprints") ? sprints : { id: "t1" }), { status: url.endsWith("/tasks") ? 201 : 200, headers: { "content-type": "application/json" } }))
    vi.stubGlobal("fetch", fetchMock)
    const onClose = vi.fn()
    renderWithProviders(<ConvertMessageDialog projectId="p1" message={msg()} canPbi canIcebox canTask onClose={onClose} />)

    await userEvent.click(screen.getByLabelText(t.talkConvertToTask))
    const sprintSelect = await screen.findByLabelText(t.talkConvertSprint)
    expect(sprintSelect).toHaveValue("s1")
    expect(screen.getAllByRole("option", { name: /^#4 / })).toHaveLength(1)
    await userEvent.click(screen.getByTestId("talk-convert-submit"))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const post = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/tasks")) as unknown as [string, RequestInit]
    expect(post[0]).toBe("/api/projects/p1/sprints/s1/tasks")
    expect(JSON.parse(String(post[1].body))).toEqual({ pbItemId: "pb1", taskName: "ログイン画面を直したい" })
  })

  it("offers only the targets the viewer may write", () => {
    renderWithProviders(<ConvertMessageDialog projectId="p1" message={msg()} canPbi={false} canIcebox canTask={false} onClose={vi.fn()} />)
    expect(screen.queryByLabelText(t.talkConvertToPbi)).not.toBeInTheDocument()
    expect(screen.getByLabelText(t.talkConvertToIcebox)).toBeChecked()
  })
})

describe("MessageItem convert button", () => {
  const NOW = new Date("2026-01-01T00:10:00Z")

  it("shows 項目にする only when a handler is given and calls it with the message", async () => {
    const onConvert = vi.fn()
    const message = msg()
    renderWithProviders(<MessageItem projectId="p1" message={message} now={NOW} onReply={vi.fn()} onDelete={vi.fn()} onJump={vi.fn()} onConvert={onConvert} />)
    await userEvent.click(screen.getByRole("button", { name: t.talkConvert }))
    expect(onConvert).toHaveBeenCalledWith(message)
  })

  it("hides it without a handler", () => {
    renderWithProviders(<MessageItem projectId="p1" message={msg()} now={NOW} onReply={vi.fn()} onDelete={vi.fn()} onJump={vi.fn()} />)
    expect(screen.queryByRole("button", { name: t.talkConvert })).not.toBeInTheDocument()
  })
})
