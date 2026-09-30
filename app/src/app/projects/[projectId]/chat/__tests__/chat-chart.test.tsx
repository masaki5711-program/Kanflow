import { cloneElement, isValidElement, type ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import type { ChartSpec } from "../chart-spec"

// jsdom has no layout: give ResponsiveContainer a fixed size so charts render.
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>()
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      isValidElement(children) ? cloneElement(children as React.ReactElement<{ width: number; height: number }>, { width: 400, height: 240 }) : null,
  }
})

const { default: ChatChart } = await import("../chat-chart")

const data = [
  { s: "S1", a: 3, b: 5 },
  { s: "S2", a: 7, b: 2 },
]

describe("ChatChart", () => {
  it("renders a titled bar chart with an accessible label", () => {
    const spec: ChartSpec = { type: "bar", title: "Velocity", x: "s", series: [{ key: "a", label: "Alpha" }, { key: "b" }], data }
    const { container } = render(<ChatChart spec={spec} />)
    expect(screen.getByText("Velocity")).toBeInTheDocument()
    expect(screen.getByRole("img", { name: "Velocity" })).toBeInTheDocument()
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull()
  })

  it("renders a single-series line chart labelled by type when untitled", () => {
    const spec: ChartSpec = { type: "line", x: "s", series: [{ key: "a" }], data }
    render(<ChatChart spec={spec} />)
    expect(screen.getByRole("img", { name: "line" })).toBeInTheDocument()
  })

  it("renders a multi-series line chart", () => {
    const spec: ChartSpec = { type: "line", x: "s", series: [{ key: "a", label: "A" }, { key: "b" }], data }
    const { container } = render(<ChatChart spec={spec} />)
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull()
  })

  it("renders a pie chart", () => {
    const spec: ChartSpec = { type: "pie", title: "Share", x: "s", series: [{ key: "a" }], data }
    const { container } = render(<ChatChart spec={spec} />)
    expect(screen.getByRole("img", { name: "Share" })).toBeInTheDocument()
    expect(container.querySelector(".recharts-wrapper")).not.toBeNull()
  })

  it("renders a single-series bar chart", () => {
    const spec: ChartSpec = { type: "bar", x: "s", series: [{ key: "a" }], data }
    render(<ChatChart spec={spec} />)
    expect(screen.getByRole("img", { name: "bar" })).toBeInTheDocument()
  })
})
