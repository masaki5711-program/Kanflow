import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { PageHeader } from "./page-header"
import * as barrel from "./index"

describe("PageHeader", () => {
  it("renders a single h1 with title, description, eyebrow and actions", () => {
    render(
      <PageHeader
        title="Backlog"
        description="Ordered list of work"
        eyebrow="Alpha"
        actions={<button type="button">Add</button>}
        headingId="page-title"
      />,
    )
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent("Backlog")
    expect(headings[0]).toHaveAttribute("id", "page-title")
    expect(headings[0].className).toContain("text-heading")
    expect(screen.getByText("Ordered list of work")).toBeInTheDocument()
    expect(screen.getByText("Alpha")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument()
  })

  it("omits optional parts", () => {
    const { container } = render(<PageHeader title="Plan" />)
    const header = container.querySelector("header")
    expect(header).not.toBeNull()
    expect(header?.children).toHaveLength(1)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })

  it("hides the decorative icon and renders children below", () => {
    const { container } = render(
      <PageHeader title="Chat" icon={<svg data-testid="icon" />} titleClassName="sr-only">
        <p>tabs</p>
      </PageHeader>,
    )
    expect(container.querySelector('[aria-hidden="true"] [data-testid="icon"]')).not.toBeNull()
    expect(screen.getByRole("heading", { level: 1 }).className).toContain("sr-only")
    expect(screen.getByText("tabs")).toBeInTheDocument()
  })

  it("wraps actions under the title instead of squeezing the title (narrow screens)", () => {
    const { container } = render(<PageHeader title="全体計画" description="説明" actions={<button type="button">今日へ</button>} />)
    const row = container.querySelector("header > div")!
    expect(row.className.split(" ")).toContain("flex-wrap")
    const title = container.querySelector("[data-page-header-title]")!
    const titleClasses = title.className.split(" ")
    // A real flex-basis (not flex-1 = basis 0) forces the wrap; min-w-0 still allows truncation.
    expect(titleClasses).toEqual(expect.arrayContaining(["min-w-0", "flex-[1_1_14rem]"]))
    expect(titleClasses).not.toContain("flex-1")
    const actions = container.querySelector("[data-page-header-actions]")!
    // Full width on phones (own row), natural width from sm.
    expect(actions.className.split(" ")).toEqual(expect.arrayContaining(["w-full", "sm:w-auto", "flex-wrap"]))
  })

  it("is exported from the ui barrel", () => {
    expect(barrel.PageHeader).toBe(PageHeader)
  })
})
