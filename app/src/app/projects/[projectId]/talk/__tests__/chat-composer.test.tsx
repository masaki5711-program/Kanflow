import { describe, expect, it, vi } from "vitest"
import { fireEvent, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { ChatComposer } from "../chat-composer"
import type { TeamMessage } from "../types"

vi.mock("@/lib/image-compress", () => ({ compressImageFile: vi.fn(async (f: File) => f) }))

const t = tr("ja")
const MEMBERS: never[] = []

function renderComposer(opts: { replyTo?: TeamMessage | null; onSend?: (body: string, files: File[]) => Promise<boolean> } = {}) {
  const onCancelReply = vi.fn()
  const onSend = vi.fn(opts.onSend ?? (async () => true))
  renderWithProviders(
    <ChatComposer members={MEMBERS} membersLoading={false} replyTo={opts.replyTo ?? null} onCancelReply={onCancelReply} onSend={onSend} />,
  )
  return { onCancelReply, onSend }
}

function fileInput() {
  return document.querySelector('[data-talk-composer] input[type="file"]') as HTMLInputElement
}

const msg = (overrides: Partial<TeamMessage> = {}): TeamMessage => ({
  id: "m1",
  author: { id: "u2", name: "Bob" },
  body: "Original message",
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
})

describe("ChatComposer", () => {
  it("sends the typed text with no files", async () => {
    const user = userEvent.setup()
    const { onSend } = renderComposer()
    await user.type(screen.getByLabelText(t.talkComposerLabel), "hello team")
    await user.click(screen.getByRole("button", { name: t.talkSend }))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("hello team", []))
  })

  it("attaches a chosen file, shows its name/size, and sends it with the body", async () => {
    const user = userEvent.setup()
    const { onSend } = renderComposer()
    const file = new File(["x".repeat(2048)], "report.pdf", { type: "application/pdf" })
    fireEvent.change(fileInput(), { target: { files: [file] } })
    expect(await screen.findByText("report.pdf")).toBeInTheDocument()
    await user.type(screen.getByLabelText(t.talkComposerLabel), "see attached")
    await user.click(screen.getByRole("button", { name: t.talkSend }))
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("see attached", [file]))
  })

  it("allows sending files with an empty body (allowEmpty)", async () => {
    const user = userEvent.setup()
    const { onSend } = renderComposer()
    const file = new File(["x"], "a.txt")
    fireEvent.change(fileInput(), { target: { files: [file] } })
    await screen.findByText("a.txt")
    const send = screen.getByRole("button", { name: t.talkSend })
    expect(send).toBeEnabled()
    await user.click(send)
    await waitFor(() => expect(onSend).toHaveBeenCalledWith("", [file]))
  })

  it("removes a chosen file via its remove button", async () => {
    const user = userEvent.setup()
    renderComposer()
    const file = new File(["x"], "a.txt")
    fireEvent.change(fileInput(), { target: { files: [file] } })
    await screen.findByText("a.txt")
    await user.click(screen.getByRole("button", { name: t.talkRemoveFile.replace("{name}", "a.txt") }))
    expect(screen.queryByText("a.txt")).not.toBeInTheDocument()
  })

  it("clears files after a successful send", async () => {
    const user = userEvent.setup()
    renderComposer()
    fireEvent.change(fileInput(), { target: { files: [new File(["x"], "a.txt")] } })
    await screen.findByText("a.txt")
    await user.click(screen.getByRole("button", { name: t.talkSend }))
    await waitFor(() => expect(screen.queryByText("a.txt")).not.toBeInTheDocument())
  })

  it("keeps the files when onSend resolves false", async () => {
    const user = userEvent.setup()
    renderComposer({ onSend: async () => false })
    fireEvent.change(fileInput(), { target: { files: [new File(["x"], "a.txt")] } })
    await screen.findByText("a.txt")
    await user.click(screen.getByRole("button", { name: t.talkSend }))
    await waitFor(() => expect(screen.getByText("a.txt")).toBeInTheDocument())
  })

  it("rejects more than 5 files at once, keeping the first 5 and toasting", async () => {
    renderComposer()
    const files = Array.from({ length: 6 }, (_, i) => new File(["x"], `f${i}.txt`))
    fireEvent.change(fileInput(), { target: { files } })
    expect(await screen.findByText(t.talkTooManyFiles)).toBeInTheDocument()
    await waitFor(() => {
      for (let i = 0; i < 5; i++) expect(screen.getByText(`f${i}.txt`)).toBeInTheDocument()
    })
    expect(screen.queryByText("f5.txt")).not.toBeInTheDocument()
  })

  it("rejects a single oversized file, naming it, and does not add it", async () => {
    renderComposer()
    const big = new File([new Uint8Array(1)], "huge.zip")
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 })
    fireEvent.change(fileInput(), { target: { files: [big] } })
    expect(await screen.findByText(t.talkFileTooLarge.replace("{name}", "huge.zip"))).toBeInTheDocument()
    expect(screen.queryByText("huge.zip")).not.toBeInTheDocument()
  })

  it("keeps the files that still fit after dropping an oversized one from a mixed batch", async () => {
    renderComposer()
    const ok = new File(["x"], "ok.txt")
    const big = new File([new Uint8Array(1)], "huge.zip")
    Object.defineProperty(big, "size", { value: 21 * 1024 * 1024 })
    fireEvent.change(fileInput(), { target: { files: [ok, big] } })
    await screen.findByText(t.talkFileTooLarge.replace("{name}", "huge.zip"))
    expect(screen.getByText("ok.txt")).toBeInTheDocument()
    expect(screen.queryByText("huge.zip")).not.toBeInTheDocument()
  })

  it("shows no reply banner by default", () => {
    renderComposer()
    expect(screen.queryByText(t.talkReplyCancel)).not.toBeInTheDocument()
  })

  it("shows the quoted message being replied to, and cancels it", async () => {
    const user = userEvent.setup()
    const { onCancelReply } = renderComposer({ replyTo: msg({ author: { id: "u2", name: "Bob" }, body: "Original message" }) })
    expect(screen.getByText(t.talkReplyingTo.replace("{name}", "Bob"))).toBeInTheDocument()
    expect(screen.getByText("Original message")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: t.talkReplyCancel }))
    expect(onCancelReply).toHaveBeenCalled()
  })

  it("shows a file-count placeholder in the quote when the replied message has no body", () => {
    renderComposer({ replyTo: msg({ body: "", attachments: [{ id: "a1", originalName: "x.png", mimeType: "image/png", fileSize: 1 }] }) })
    expect(screen.getByText(t.talkQuoteFiles.replace("{n}", "1"))).toBeInTheDocument()
  })

  it("shows the 'also posted to thread' note when the replied message has a source", () => {
    renderComposer({ replyTo: msg({ source: { entityType: "pbi", entityId: "pb1", label: "#5 Login" } }) })
    expect(screen.getByText(t.talkReplyAlsoThread.replace("{source}", t.talkSourcePbi.replace("{label}", "#5 Login")))).toBeInTheDocument()
  })

  it("falls back to an em dash author name when the replied-to author is gone", () => {
    renderComposer({ replyTo: msg({ author: null }) })
    expect(screen.getByText(t.talkReplyingTo.replace("{name}", "—"))).toBeInTheDocument()
  })

  it("accepts a drop of files onto the composer", async () => {
    renderComposer()
    const composer = document.querySelector("[data-talk-composer]") as HTMLElement
    const file = new File(["z"], "dropped.txt")
    fireEvent.dragEnter(composer, { dataTransfer: { types: ["Files"], files: [file] } })
    fireEvent.drop(composer, { dataTransfer: { types: ["Files"], files: [file] } })
    expect(await screen.findByText("dropped.txt")).toBeInTheDocument()
  })
})
