import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import { getTranslations } from "@/lib/i18n"
import { renderWithProviders } from "@/components/__tests__/helpers"
import { CommentCountButton } from "../comments-dialog"
import { toUnread } from "../use-comment-thread"

const t = getTranslations("en")

describe("CommentCountButton unread mark", () => {
  it("the red number is the UNREAD count (not the total)", () => {
    renderWithProviders(<CommentCountButton name="Task A" count={3} unread={2} onClick={vi.fn()} />)
    const button = screen.getByRole("button", { name: new RegExp(t.commentsUnreadLabel.replace("{count}", "2")) })
    expect(button.querySelector("[data-comment-unread]")).toHaveTextContent("2")
  })

  it("all read: no number at all, a 'has comments' icon, the total only in the label", () => {
    renderWithProviders(<CommentCountButton name="Task A" count={3} onClick={vi.fn()} />)
    const button = screen.getByRole("button")
    expect(button.querySelector("[data-comment-unread]")).toBeNull()
    expect(button).not.toHaveTextContent("3")
    expect(button.querySelector("[data-comment-has]")).toBeInTheDocument()
    expect(button.getAttribute("aria-label")).toContain(t.commentsCountLabel.replace("{count}", "3"))
  })

  it("no comments: plain icon, no badge", () => {
    renderWithProviders(<CommentCountButton name="Task A" count={0} onClick={vi.fn()} />)
    expect(screen.getByRole("button").querySelector("[data-comment-has]")).toBeNull()
    expect(screen.getByRole("button").querySelector("[data-comment-unread]")).toBeNull()
  })
})

describe("toUnread", () => {
  it("keeps positive numbers only and tolerates garbage", () => {
    expect(toUnread({ unread: { a: 2, b: 0, c: "x" } })).toEqual({ a: 2 })
    expect(toUnread(null)).toEqual({})
    expect(toUnread({ unread: 5 })).toEqual({})
  })
})
