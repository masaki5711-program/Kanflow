import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import { renderWithProviders } from "@/components/__tests__/helpers"
import { CommentCountButton } from "../comments-dialog"
import { toUnread } from "../use-comment-thread"

const t = getTranslations("en")

describe("CommentCountButton unread mark", () => {
  it("shows the count bubble in red with an unread label when there are unread mentions", () => {
    renderWithProviders(<CommentCountButton name="Task A" count={3} unread={2} onClick={vi.fn()} />)
    const button = screen.getByRole("button", { name: new RegExp(t.commentsUnreadLabel.replace("{count}", "2")) })
    expect(button.querySelector("[data-comment-unread]")).toHaveTextContent("3")
  })

  it("shows a red dot when there are unread notifications but no count", () => {
    renderWithProviders(<CommentCountButton name="Task A" count={0} unread={1} onClick={vi.fn()} />)
    expect(screen.getByRole("button").querySelector("[data-comment-unread]")).toBeInTheDocument()
  })

  it("no unread mark when everything is read", () => {
    renderWithProviders(<CommentCountButton name="Task A" count={3} onClick={vi.fn()} />)
    expect(screen.getByRole("button").querySelector("[data-comment-unread]")).toBeNull()
    expect(screen.getByRole("button").getAttribute("aria-label")).not.toContain(t.commentsUnreadLabel.replace("{count}", ""))
  })
})

describe("toUnread", () => {
  it("keeps positive numbers only and tolerates garbage", () => {
    expect(toUnread({ unread: { a: 2, b: 0, c: "x" } })).toEqual({ a: 2 })
    expect(toUnread(null)).toEqual({})
    expect(toUnread({ unread: 5 })).toEqual({})
  })
})
