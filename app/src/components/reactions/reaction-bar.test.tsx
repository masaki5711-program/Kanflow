import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LanguageProvider } from "@/lib/language-context"
import { ToastProvider } from "@/components/ui"
import { ReactionBar } from "./reaction-bar"
import { BATCH_WINDOW_MS, resetReactionCache } from "./use-reactions"

const apiFetch = vi.fn()
vi.mock("@/hooks", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/hooks")>()), apiFetch: (...a: unknown[]) => apiFetch(...a) }))

function renderBar(id = "c1") {
  return render(
    <LanguageProvider initialLanguage="en">
      <ToastProvider>
        <div className="group">
          <ReactionBar projectId="p1" targetType="comment" targetId={id} />
        </div>
      </ToastProvider>
    </LanguageProvider>,
  )
}

const thumbs = (count: number, mine: boolean) => [{ emoji: "👍", count, mine, users: ["Alice"] }]

beforeEach(() => {
  resetReactionCache()
  apiFetch.mockReset()
})
afterEach(() => resetReactionCache())

describe("ReactionBar", () => {
  it("shows the chips the server returned, after one batched request", async () => {
    apiFetch.mockResolvedValue({ reactions: { c1: thumbs(2, false), c2: [] } })
    renderBar("c1")
    renderBar("c2")
    expect(await screen.findByRole("button", { name: "Add 👍 reaction (2 so far)" })).toHaveAttribute("aria-pressed", "false")
    expect(apiFetch).toHaveBeenCalledTimes(1)
    expect(apiFetch.mock.calls[0][0]).toBe("/api/projects/p1/reactions?targetType=comment&ids=c1,c2")
  })

  it("adds a reaction from the palette at once and keeps the server's answer", async () => {
    apiFetch.mockResolvedValueOnce({ reactions: { c1: [] } })
    renderBar()
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    let resolve!: (v: unknown) => void
    apiFetch.mockReturnValueOnce(new Promise((r) => (resolve = r)))

    await userEvent.click(screen.getByRole("button", { name: "Add reaction" }))
    await userEvent.click(screen.getByRole("button", { name: "❤️" }))

    // Optimistic: the chip is there before the server answered.
    expect(await screen.findByRole("button", { name: "Remove your ❤️ reaction (1 so far)" })).toHaveAttribute("aria-pressed", "true")
    expect(apiFetch).toHaveBeenLastCalledWith("/api/projects/p1/reactions", { method: "POST", json: { targetType: "comment", targetId: "c1", emoji: "❤️" } })
    resolve({ active: true, reactions: [{ emoji: "❤️", count: 3, mine: true, users: ["Alice"] }] })
    expect(await screen.findByRole("button", { name: "Remove your ❤️ reaction (3 so far)" })).toBeInTheDocument()
  })

  it("takes my own reaction back with a click on its chip", async () => {
    apiFetch.mockResolvedValueOnce({ reactions: { c1: thumbs(1, true) } })
    renderBar()
    apiFetch.mockResolvedValueOnce({ active: false, reactions: [] })
    await userEvent.click(await screen.findByRole("button", { name: "Remove your 👍 reaction (1 so far)" }))
    await waitFor(() => expect(screen.queryByRole("button", { name: /👍/ })).not.toBeInTheDocument())
  })

  it("rolls the chip back and tells the user when the server refuses", async () => {
    apiFetch.mockResolvedValueOnce({ reactions: { c1: thumbs(2, false) } })
    renderBar()
    apiFetch.mockRejectedValueOnce(new Error("nope"))
    await userEvent.click(await screen.findByRole("button", { name: "Add 👍 reaction (2 so far)" }))
    expect(await screen.findByText("Could not update the reaction")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add 👍 reaction (2 so far)" })).toHaveAttribute("aria-pressed", "false")
  })

  it("keeps the last click when two clicks answer out of order", async () => {
    apiFetch.mockResolvedValueOnce({ reactions: { c1: [] } })
    renderBar()
    await waitFor(() => expect(apiFetch).toHaveBeenCalledTimes(1))
    const resolvers: ((v: unknown) => void)[] = []
    apiFetch.mockImplementation(() => new Promise((r) => resolvers.push(r)))

    await userEvent.click(screen.getByRole("button", { name: "Add reaction" }))
    await userEvent.click(screen.getByRole("button", { name: "👍" }))
    // Second click on the same chip (take back) while the first is still in flight.
    await userEvent.click(screen.getByRole("button", { name: "Remove your 👍 reaction (1 so far)" }))
    expect(screen.queryByRole("button", { name: /👍/ })).not.toBeInTheDocument()

    // Clicks go out one after the other: the second waits for the first.
    await waitFor(() => expect(resolvers).toHaveLength(1))
    resolvers[0]({ active: true, reactions: [{ emoji: "👍", count: 1, mine: true, users: ["Alice"] }] })
    await waitFor(() => expect(resolvers).toHaveLength(2))
    // The first answer must not bring the chip back.
    expect(screen.queryByRole("button", { name: /👍/ })).not.toBeInTheDocument()
    resolvers[1]({ active: false, reactions: [] })
    await waitFor(() => expect(screen.queryByRole("button", { name: /👍/ })).not.toBeInTheDocument())
  })

  it("gives focus back to the + button after a pick", async () => {
    apiFetch.mockResolvedValue({ active: true, reactions: [{ emoji: "🎉", count: 1, mine: true, users: ["A"] }] })
    renderBar()
    await new Promise((r) => setTimeout(r, BATCH_WINDOW_MS + 10))
    const plus = screen.getByRole("button", { name: "Add reaction" })
    await userEvent.click(plus)
    await userEvent.click(screen.getByRole("button", { name: "🎉" }))
    expect(plus).toHaveFocus()
  })

  it("closes the palette with Escape", async () => {
    apiFetch.mockResolvedValue({ reactions: { c1: [] } })
    renderBar()
    await new Promise((r) => setTimeout(r, BATCH_WINDOW_MS + 10))
    await userEvent.click(screen.getByRole("button", { name: "Add reaction" }))
    expect(screen.getByRole("button", { name: "🎉" })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("button", { name: "🎉" })).not.toBeInTheDocument()
  })
})
