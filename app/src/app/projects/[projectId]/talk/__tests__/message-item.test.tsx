import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { MessageItem } from "../message-item"
import type { TeamMessage } from "../types"

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a>,
}))

const t = tr("ja")
const NOW = new Date("2026-01-01T00:10:00Z")

function msg(overrides: Partial<TeamMessage> = {}): TeamMessage {
  return {
    id: "m1",
    author: { id: "u1", name: "Alice" },
    body: "Hello team",
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

function renderItem(message: TeamMessage) {
  const onReply = vi.fn()
  const onDelete = vi.fn()
  const onJump = vi.fn()
  renderWithProviders(<MessageItem projectId="p1" message={message} now={NOW} onReply={onReply} onDelete={onDelete} onJump={onJump} />)
  return { onReply, onDelete, onJump }
}

describe("MessageItem", () => {
  it("renders the author, relative time and body", () => {
    renderItem(msg())
    expect(screen.getByText("Alice")).toBeInTheDocument()
    expect(screen.getByText("Hello team")).toBeInTheDocument()
    const time = screen.getByText((_, el) => el?.tagName === "TIME")
    expect(time).toHaveAttribute("datetime", "2026-01-01T00:00:00Z")
  })

  it("shows an em dash for a missing author and a dot avatar initial", () => {
    renderItem(msg({ author: null }))
    expect(screen.getByText("—")).toBeInTheDocument()
    expect(screen.getByText("·")).toBeInTheDocument()
  })

  it("shows the (edited) marker when editedAt is set", () => {
    renderItem(msg({ editedAt: "2026-01-02T00:00:00Z" }))
    expect(screen.getByText(t.talkEdited)).toBeInTheDocument()
  })

  it("does not show the edited marker when editedAt is null", () => {
    renderItem(msg({ editedAt: null }))
    expect(screen.queryByText(t.talkEdited)).not.toBeInTheDocument()
  })

  it("shows the 'for you' tag when mentioned, taking priority over the reply tag", () => {
    renderItem(msg({ mentionsMe: true, repliesToMe: true }))
    expect(screen.getByText(t.talkForYouTag.replace(/^@/, ""))).toBeInTheDocument()
    expect(screen.queryByText(t.talkReplyToYouTag)).not.toBeInTheDocument()
  })

  it("shows the 'reply to you' tag when only repliesToMe is true", () => {
    renderItem(msg({ mentionsMe: false, repliesToMe: true }))
    expect(screen.getByText(t.talkReplyToYouTag)).toBeInTheDocument()
  })

  it("shows neither tag for a plain message", () => {
    renderItem(msg())
    expect(screen.queryByText(t.talkReplyToYouTag)).not.toBeInTheDocument()
    expect(screen.queryByText(t.talkForYouTag.replace(/^@/, ""))).not.toBeInTheDocument()
  })

  it("shows a source link when the message has a source and was not also posted to the thread", () => {
    renderItem(msg({ source: { entityType: "pbi", entityId: "pb1", label: "#5 Login" } }))
    const link = screen.getByRole("link", { name: new RegExp(t.talkFromSource.replace("{source}", t.talkSourcePbi.replace("{label}", "#5 Login"))) })
    expect(link).toHaveAttribute("href", "/projects/p1/backlog?pbi=pb1&tab=comments")
  })

  it("hides the source link when the message was posted to the thread (shown as the thread note instead)", () => {
    renderItem(msg({ source: { entityType: "pbi", entityId: "pb1", label: "#5" }, postedToThread: true }))
    expect(screen.queryByText(new RegExp(t.talkFromSource.replace("{source}", "")))).not.toBeInTheDocument()
    expect(screen.getByText(t.talkPostedToThread.replace("{source}", t.talkSourcePbi.replace("{label}", "#5")))).toBeInTheDocument()
  })

  describe("reply quote", () => {
    it("shows the quoted author and excerpt, and jumps on click", async () => {
      const user = userEvent.setup()
      const { onJump } = renderItem(msg({ replyTo: { id: "orig1", authorName: "Bob", excerpt: "Original text", attachmentCount: 0, deleted: false, source: null } }))
      const quote = screen.getByText("Original text").closest("button")!
      expect(within(quote).getByText("Bob")).toBeInTheDocument()
      await user.click(quote)
      expect(onJump).toHaveBeenCalledWith("orig1")
    })

    it("shows the deleted placeholder when the quoted message was deleted", () => {
      renderItem(msg({ replyTo: { id: "orig1", authorName: "Bob", excerpt: "gone", attachmentCount: 0, deleted: true, source: null } }))
      expect(screen.getByText(t.talkQuoteDeleted)).toBeInTheDocument()
    })

    it("shows an attachment-count suffix when the quoted message has files", () => {
      renderItem(msg({ replyTo: { id: "orig1", authorName: "Bob", excerpt: "see attached", attachmentCount: 2, deleted: false, source: null } }))
      expect(screen.getByText(t.talkQuoteFiles.replace("{n}", "2"))).toBeInTheDocument()
    })

    it("shows an em dash when the quoted author is gone", () => {
      renderItem(msg({ replyTo: { id: "orig1", authorName: null, excerpt: "x", attachmentCount: 0, deleted: false, source: null } }))
      expect(screen.getByText("—")).toBeInTheDocument()
    })
  })

  describe("attachments", () => {
    it("renders images inline and other files as a link list", () => {
      renderItem(
        msg({
          body: "",
          attachments: [
            { id: "img1", originalName: "pic.png", mimeType: "image/png", fileSize: 10 },
            { id: "doc1", originalName: "spec.pdf", mimeType: "application/pdf", fileSize: 20 },
          ],
        }),
      )
      // Images open full screen in the app (no new tab).
      const imgButton = screen.getByRole("button", { name: t.talkOpenFile.replace("{name}", "pic.png") })
      expect(within(imgButton).getByRole("img", { name: "pic.png" })).toHaveAttribute("src", "/api/projects/p1/talk/attachments/img1")
      const fileLink = screen.getByRole("link", { name: "spec.pdf" })
      expect(fileLink).toHaveAttribute("href", "/api/projects/p1/talk/attachments/doc1")
    })
  })

  it("calls onReply with the message", async () => {
    const user = userEvent.setup()
    const { onReply } = renderItem(msg())
    await user.click(screen.getByRole("button", { name: `${t.talkReply}: Alice` }))
    expect(onReply).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }))
  })

  it("shows the delete button only when canDelete is true", async () => {
    const user = userEvent.setup()
    const { onDelete } = renderItem(msg({ canDelete: true }))
    await user.click(screen.getByRole("button", { name: t.talkDelete }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ id: "m1" }))
  })

  it("hides the delete button when canDelete is false", () => {
    renderItem(msg({ canDelete: false }))
    expect(screen.queryByRole("button", { name: t.talkDelete })).not.toBeInTheDocument()
  })
})
