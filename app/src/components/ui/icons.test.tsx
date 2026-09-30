import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { DisclosureChevron, FileTypeIcon, SprintStatusIcon, TaskStatusIcon } from "./icons"

describe("ui icons", () => {
  it("renders every composite icon as decorative (aria-hidden)", () => {
    const { container } = render(
      <div>
        <DisclosureChevron open={false} />
        <TaskStatusIcon status="done" />
        <SprintStatusIcon status="active" />
        <FileTypeIcon mimeType="application/pdf" />
      </div>,
    )
    const svgs = container.querySelectorAll("svg")
    expect(svgs).toHaveLength(4)
    svgs.forEach((svg) => expect(svg.getAttribute("aria-hidden")).toBe("true"))
  })

  it("rotates the chevron only when open", () => {
    const { container, rerender } = render(<DisclosureChevron open={false} />)
    expect(container.querySelector("svg")?.getAttribute("class")).not.toContain("rotate-90")
    rerender(<DisclosureChevron open />)
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("rotate-90")
    rerender(<DisclosureChevron open variant="down" />)
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("rotate-180")
  })

  it("renders nothing for an unknown sprint status", () => {
    const { container } = render(<SprintStatusIcon status="bogus" />)
    expect(container.querySelector("svg")).toBeNull()
  })

  it("colours file icons by mime type", () => {
    const { container } = render(<FileTypeIcon mimeType="application/pdf" />)
    expect(container.querySelector("svg")?.getAttribute("class")).toContain("text-danger")
  })
})
