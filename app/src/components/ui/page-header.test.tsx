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

  it("is exported from the ui barrel", () => {
    expect(barrel.PageHeader).toBe(PageHeader)
  })
})
