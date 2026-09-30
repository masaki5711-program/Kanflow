import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Button, IconButton, buttonClasses } from "./button"

describe("Button", () => {
  it("renders a type=button with its label and fires onClick", async () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)

    const button = screen.getByRole("button", { name: "Save" })
    expect(button).toHaveAttribute("type", "button")
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it("is disabled and aria-busy while loading", async () => {
    const onClick = vi.fn()
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    )

    const button = screen.getByRole("button", { name: /Save/ })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute("aria-busy", "true")
    await userEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it("lets a caller className override conflicting utilities", () => {
    render(<Button className="px-8">Wide</Button>)
    const cls = screen.getByRole("button", { name: "Wide" }).className
    expect(cls).toContain("px-8")
    expect(cls).not.toContain("px-4")
    // font-size token and text colour must both survive the merge
    expect(cls).toContain("text-body")
    expect(cls).toContain("text-primary-fg")
  })
})

describe("IconButton", () => {
  it("exposes its label as the accessible name", () => {
    render(<IconButton label="Close" icon={<svg />} />)
    const button = screen.getByRole("button", { name: "Close" })
    expect(button).toHaveAttribute("title", "Close")
  })

  it("omits the native tooltip when showTitle is false", () => {
    render(<IconButton label="Close" icon={<svg />} showTitle={false} />)
    expect(screen.getByRole("button", { name: "Close" })).not.toHaveAttribute("title")
  })
})

describe("buttonClasses", () => {
  it("uses link sizing for the link variant", () => {
    const cls = buttonClasses({ variant: "link", size: "sm" })
    expect(cls).toContain("min-h-6")
    expect(cls).not.toContain("px-3")
  })

  it("adds w-full when fullWidth is set", () => {
    expect(buttonClasses({ fullWidth: true })).toContain("w-full")
  })
})
