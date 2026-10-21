import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"
import { renderWithProviders } from "@/components/__tests__/helpers"
import { GitCardBadge } from "../git-card-badge"

const summary = (over: Partial<{ openMrs: number; mergedMrs: number; branches: number; pipeline: string | null }> = {}) => ({
  openMrs: 0,
  mergedMrs: 0,
  branches: 0,
  pipeline: null,
  ...over,
})

describe("GitCardBadge", () => {
  it("renders nothing without a summary or without activity", () => {
    const { rerender } = renderWithProviders(<div data-testid="host"><GitCardBadge summary={undefined} /></div>, "ja")
    expect(screen.getByTestId("host")).toBeEmptyDOMElement()
    rerender(<div data-testid="host"><GitCardBadge summary={summary()} /></div>)
    expect(screen.getByTestId("host")).toBeEmptyDOMElement()
  })

  it("says how many MRs are open and how the pipeline went", () => {
    renderWithProviders(<GitCardBadge summary={summary({ openMrs: 2, mergedMrs: 1, pipeline: "failed" })} />, "ja")
    expect(screen.getByText("マージリクエスト 2 件オープン、パイプライン: 失敗")).toHaveClass("sr-only")
    const badge = document.querySelector("[data-git-badge]") as HTMLElement
    expect(badge).toHaveAttribute("title", "マージリクエスト 2 件オープン、パイプライン: 失敗")
    expect(badge.querySelector(".bg-danger")).not.toBeNull()
    // The badge says "MR" in words, not just an icon and a number.
    expect(badge).toHaveTextContent("MR 2 件")
    expect(badge).toHaveAttribute("data-git-badge", "open")
  })

  it("spells out merged and branch-only states in the visible text", () => {
    const { unmount } = renderWithProviders(<GitCardBadge summary={summary({ mergedMrs: 1 })} />, "ja")
    expect(document.querySelector("[data-git-badge]")).toHaveTextContent("MR マージ済み")
    unmount()
    renderWithProviders(<GitCardBadge summary={summary({ branches: 2 })} />, "ja")
    expect(document.querySelector("[data-git-badge]")).toHaveTextContent("ブランチ 2")
  })

  it("shows merged when every MR is merged, with a green dot for a passed pipeline", () => {
    renderWithProviders(<GitCardBadge summary={summary({ mergedMrs: 2, pipeline: "success" })} />, "ja")
    expect(screen.getByText("マージ済み、パイプライン: 成功")).toBeInTheDocument()
    expect(document.querySelector("[data-git-badge] .bg-success")).not.toBeNull()
  })

  it("falls back to the branch count, amber dot while running", () => {
    renderWithProviders(<GitCardBadge summary={summary({ branches: 3, pipeline: "running" })} />, "en")
    expect(screen.getByText("3 branch(es), Pipeline: running")).toBeInTheDocument()
    expect(document.querySelector("[data-git-badge] .bg-warning")).not.toBeNull()
  })

  it("has no dot when the pipeline is unknown", () => {
    renderWithProviders(<GitCardBadge summary={summary({ openMrs: 1 })} />, "en")
    expect(screen.getByText("1 open merge request(s)")).toBeInTheDocument()
    expect(document.querySelector("[data-git-badge] .rounded-full .rounded-full")).toBeNull()
  })
})
