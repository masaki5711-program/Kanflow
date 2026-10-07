import { describe, expect, it, vi } from "vitest"
import { fireEvent, render } from "@testing-library/react"
import { PlanDependencyHitLayer, PlanDependencyLayer } from "../components/plan-dependency-layer"
import type { DependencyArrow } from "../lib/geometry"

const arrow = (over: Partial<DependencyArrow> & { id: string; predecessorId: string; successorId: string }): DependencyArrow => ({
  d: "M0 0 H10",
  violated: false,
  severity: "none",
  ...over,
})

describe("PlanDependencyLayer", () => {
  it("renders nothing without arrows", () => {
    const { container } = render(<PlanDependencyLayer arrows={[]} width={100} height={100} chain={null} violatedLabel="violated" sameDayLabel="same day" />)
    expect(container.querySelector("svg")).toBeNull()
  })

  it("without a chain, every arrow is full-opacity and unmarked", () => {
    const arrows = [arrow({ id: "e1", predecessorId: "a", successorId: "b" })]
    const { container } = render(<PlanDependencyLayer arrows={arrows} width={100} height={100} chain={null} violatedLabel="violated" sameDayLabel="same day" />)
    const path = container.querySelector('[data-plan-arrow="e1"]') as SVGPathElement
    expect(path).not.toHaveAttribute("data-chain")
    expect(path).toHaveAttribute("opacity", "1")
  })

  it("emphasises arrows fully inside the chain and fades the rest", () => {
    const arrows = [
      arrow({ id: "e1", predecessorId: "a", successorId: "b" }),
      arrow({ id: "e2", predecessorId: "b", successorId: "c" }),
    ]
    const chain = new Set(["a", "b"])
    const { container } = render(<PlanDependencyLayer arrows={arrows} width={100} height={100} chain={chain} violatedLabel="violated" sameDayLabel="same day" />)
    const inChain = container.querySelector('[data-plan-arrow="e1"]') as SVGPathElement
    const outChain = container.querySelector('[data-plan-arrow="e2"]') as SVGPathElement
    expect(inChain).toHaveAttribute("data-chain", "true")
    expect(inChain).toHaveAttribute("opacity", "1")
    expect(outChain).not.toHaveAttribute("data-chain")
    expect(outChain).toHaveAttribute("opacity", "0.3")
  })

  it("draws a same-day start orange (dashed) with its own title", () => {
    const arrows = [arrow({ id: "e1", predecessorId: "a", successorId: "b", violated: true, severity: "sameDay" })]
    const { container, getByText } = render(<PlanDependencyLayer arrows={arrows} width={100} height={100} chain={null} violatedLabel="starts before" sameDayLabel="starts on the end day" />)
    const path = container.querySelector('[data-plan-arrow="e1"]') as SVGPathElement
    expect(path).toHaveAttribute("data-severity", "sameDay")
    expect(path).toHaveAttribute("stroke-dasharray", "4 3")
    expect(path.getAttribute("class")).toContain("stroke-warning")
    expect(getByText("starts on the end day")).toBeInTheDocument()
  })

  it("draws a start before the predecessor's end red, thicker and densely dashed", () => {
    const arrows = [arrow({ id: "e1", predecessorId: "a", successorId: "b", violated: true, severity: "before" })]
    const { container, getByText } = render(<PlanDependencyLayer arrows={arrows} width={100} height={100} chain={null} violatedLabel="starts before" sameDayLabel="starts on the end day" />)
    const path = container.querySelector('[data-plan-arrow="e1"]') as SVGPathElement
    expect(path).toHaveAttribute("data-violated", "true")
    expect(path).toHaveAttribute("data-severity", "before")
    expect(path).toHaveAttribute("stroke-dasharray", "3 2")
    expect(path.getAttribute("class")).toContain("stroke-danger")
    expect(getByText("starts before")).toBeInTheDocument()
  })
})

describe("PlanDependencyHitLayer", () => {
  it("renders nothing without arrows", () => {
    const { container } = render(<PlanDependencyHitLayer arrows={[]} width={10} height={10} titleOf={() => ""} onPick={vi.fn()} />)
    expect(container.querySelector("svg")).toBeNull()
  })

  it("clicking a hit path calls onPick with that arrow", () => {
    const onPick = vi.fn()
    const arrows = [arrow({ id: "e1", predecessorId: "a", successorId: "b" }), arrow({ id: "e2", predecessorId: "b", successorId: "c" })]
    const { container } = render(<PlanDependencyHitLayer arrows={arrows} width={10} height={10} titleOf={(a) => `remove ${a.id}`} onPick={onPick} />)
    const hit = container.querySelector('[data-plan-arrow-hit="e2"]') as SVGPathElement
    fireEvent.click(hit)
    expect(onPick).toHaveBeenCalledWith(arrows[1])
    expect(hit.querySelector("title")?.textContent).toBe("remove e2")
  })
})
