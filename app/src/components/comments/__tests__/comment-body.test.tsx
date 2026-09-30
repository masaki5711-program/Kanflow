import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import type { EntityI18n } from "@/lib/translation/types"
import { CommentBody } from "../comment-body"

stubLayout()

const JA = "@[E2E SM] さん、スプリント計画前にレビューしてください。"
const ID = "@[E2E SM] mohon tinjau sebelum perencanaan sprint."
const DONE: EntityI18n = { body: { ja: JA, id: ID, source: "ja", status: "done" } }
const MENTIONS = [{ id: "u2", name: "E2E SM" }]

describe("CommentBody translation (A3-03)", () => {
  it("shows the Indonesian translation to an id viewer, mention kept, original behind the toggle", async () => {
    const tId = getTranslations("id")
    renderWithProviders(<CommentBody body={JA} mentions={MENTIONS} i18n={DONE} commentId="c1" />, "id")
    expect(screen.getByText(/mohon tinjau/)).toBeInTheDocument()
    expect(screen.getByText("@E2E SM")).toHaveAttribute("data-mention")
    expect(screen.queryByText(/レビューしてください/)).not.toBeInTheDocument()
    const toggle = screen.getByRole("button", { name: tId.translationOriginalLabel })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText(/レビューしてください/).closest("[data-comment-original]")).toHaveAttribute("lang", "ja")
  })

  it("shows the source text without toggle or badge to a viewer of the source language", () => {
    renderWithProviders(<CommentBody body={JA} mentions={MENTIONS} i18n={DONE} commentId="c1" />, "ja")
    expect(screen.getByText(/レビューしてください/)).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("shows the original with a translate-now badge while the translation is pending", () => {
    const tId = getTranslations("id")
    const pending: EntityI18n = { body: { ja: JA, id: null, source: "ja", status: "pending" } }
    renderWithProviders(<CommentBody body={JA} mentions={MENTIONS} i18n={pending} commentId="c1" />, "id")
    expect(screen.getByText(/レビューしてください/).closest("p")).toHaveAttribute("lang", "ja")
    expect(screen.getByRole("button", { name: tId.translationPending })).toBeInTheDocument()
  })

  it("renders plain comments (no i18n) exactly as before", () => {
    renderWithProviders(<CommentBody body="see https://example.com" mentions={[]} />, "id")
    expect(screen.getByRole("link", { name: "https://example.com" })).toBeInTheDocument()
  })
})
