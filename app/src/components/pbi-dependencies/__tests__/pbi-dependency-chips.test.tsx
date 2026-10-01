import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { PbiDependencyChips, PbiWaitingChip } from "../pbi-dependency-chips"
import type { PbiDependencyRefDto } from "@/types/api"

const t = tr("ja")

const ref = (id: string, displayId: number, status: string): PbiDependencyRefDto => ({
  dependencyId: `dep-${id}`,
  id,
  displayId,
  initiative: `Initiative ${id}`,
  userStory: null,
  status,
  i18n: {},
})

describe("PbiWaitingChip / PbiDependencyChips", () => {
  it("shows the single-predecessor waiting text and opens it on click", async () => {
    const onOpenRef = vi.fn()
    const first = ref("a", 1, "ready")
    renderWithProviders(<PbiDependencyChips item={{ id: "x", blockedBy: [first] }} onOpenRef={onOpenRef} />)
    const chip = screen.getByText(t.depChipWaitingOne.replace("{id}", "1")).closest("button") as HTMLElement
    await userEvent.click(chip)
    expect(onOpenRef).toHaveBeenCalledWith(first)
  })

  it("shows the 'and N more' text with multiple open predecessors, opening the first one", async () => {
    const onOpenRef = vi.fn()
    const first = ref("a", 1, "ready")
    const second = ref("b", 2, "not_ready")
    renderWithProviders(<PbiDependencyChips item={{ id: "x", blockedBy: [first, second] }} onOpenRef={onOpenRef} />)
    const chip = screen.getByText(t.depChipWaitingMany.replace("{id}", "1").replace("{n}", "1")).closest("button") as HTMLElement
    await userEvent.click(chip)
    expect(onOpenRef).toHaveBeenCalledWith(first)
  })

  it("renders a plain (non-interactive) chip without onOpenRef", () => {
    renderWithProviders(<PbiWaitingChip item={{ id: "x", blockedBy: [ref("a", 1, "ready")] }} />)
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText(t.depChipWaitingOne.replace("{id}", "1"))).toBeInTheDocument()
  })

  it("shows the ready chip once every predecessor is completed", () => {
    renderWithProviders(<PbiDependencyChips item={{ id: "x", blockedBy: [ref("a", 1, "completed")] }} />)
    expect(screen.getByText(t.depChipReady)).toBeInTheDocument()
    expect(screen.queryByText(t.depChipWaitingOne.replace("{id}", "1"))).not.toBeInTheDocument()
  })

  it("shows no chips without any dependency", () => {
    const { container } = renderWithProviders(<PbiDependencyChips item={{ id: "x" }} />)
    expect(screen.queryByText(t.depChipReady)).not.toBeInTheDocument()
    expect(container.querySelector("[data-pbi-blocking]")).not.toBeInTheDocument()
  })

  it("shows the blocking count of open successors", () => {
    renderWithProviders(
      <PbiDependencyChips item={{ id: "x", blocking: [ref("a", 1, "ready"), ref("b", 2, "completed")] }} />,
    )
    expect(screen.getByText(t.depChipBlocking.replace("{n}", "1"))).toBeInTheDocument()
  })
})
