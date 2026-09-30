import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { Field, useFieldControl } from "./field"
import { Input, Select, Textarea } from "./input"
import { Badge } from "./badge"
import { Spinner } from "./spinner"
import { Skeleton, SkeletonCard, SkeletonLines, SkeletonTable } from "./skeleton"
import { EmptyState } from "./empty-state"
import { VisuallyHidden } from "./visually-hidden"
import { getUiLabels, useUiLabels } from "./labels"
import { LanguageProvider } from "@/lib/language-context"
import type { Language } from "@/lib/i18n"

function withLang(ui: React.ReactNode, language: Language = "en") {
  return render(<LanguageProvider initialLanguage={language}>{ui}</LanguageProvider>)
}

describe("Field", () => {
  it("associates the label with an Input via a generated id", () => {
    withLang(
      <Field label="Title">
        <Input />
      </Field>,
    )
    const input = screen.getByLabelText("Title")
    expect(input.tagName).toBe("INPUT")
    expect(input.id).toMatch(/^field-/)
  })

  it("uses an explicit id and links hint + error through aria-describedby", () => {
    withLang(
      <Field label="Email" id="email" hint="We never share it" error="Invalid email" required>
        <Input aria-describedby="extra" />
      </Field>,
    )
    const input = screen.getByRole("textbox", { name: /Email/ })
    expect(input).toHaveAttribute("id", "email")
    expect(input).toHaveAttribute("aria-describedby", "email-hint email-error extra")
    expect(input).toHaveAttribute("aria-invalid", "true")
    expect(input).toHaveAttribute("aria-required", "true")
    expect(input.className).toContain("border-danger")
    expect(screen.getByRole("alert")).toHaveTextContent("Invalid email")
    expect(screen.getByText("(Required)", { exact: false })).toHaveClass("sr-only")
  })

  it("lets explicit props win over Field-provided values", () => {
    withLang(
      <Field label="Name" error="bad">
        <Input id="own" aria-invalid={false} />
      </Field>,
    )
    const input = screen.getByRole("textbox")
    expect(input).toHaveAttribute("id", "own")
    expect(input).toHaveAttribute("aria-invalid", "false")
  })

  it("wires Textarea and Select too, and supports hidden labels", () => {
    withLang(
      <>
        <Field label="Body" hideLabel>
          <Textarea />
        </Field>
        <Field label="Kind" hint="pick one">
          <Select selectSize="lg">
            <option>a</option>
          </Select>
        </Field>
      </>,
    )
    expect(screen.getByLabelText("Body").tagName).toBe("TEXTAREA")
    expect(screen.getByText("Body")).toHaveClass("sr-only")
    expect(screen.getByRole("combobox", { name: "Kind" })).toHaveAccessibleDescription("pick one")
  })

  it("passes control props to a render function and to useFieldControl consumers", () => {
    function Custom() {
      const ctl = useFieldControl()
      return <input data-testid="custom" {...(ctl ?? {})} />
    }
    withLang(
      <>
        <Field label="Render">{(control) => <input {...control} />}</Field>
        <Field label="Hooked">
          <Custom />
        </Field>
      </>,
    )
    expect(screen.getByLabelText("Render")).toBeInTheDocument()
    expect(screen.getByLabelText("Hooked")).toBe(screen.getByTestId("custom"))
  })

  it("Input outside a Field renders plainly", () => {
    render(<Input placeholder="free" inputSize="sm" aria-invalid="true" />)
    expect(screen.getByPlaceholderText("free").className).toContain("border-danger")
  })
})

describe("small UI primitives", () => {
  it("Badge renders tone, size and optional dot", () => {
    const { container } = render(
      <>
        <Badge tone="danger" size="md" dot>
          Blocked
        </Badge>
        <Badge>Plain</Badge>
      </>,
    )
    expect(screen.getByText("Blocked").className).toContain("bg-danger-soft")
    expect(container.querySelectorAll("[aria-hidden='true']")).toHaveLength(1)
  })

  it("Spinner is decorative without a label and a status with one", () => {
    const { container } = render(<Spinner size="lg" />)
    expect(container.firstChild).toHaveAttribute("aria-hidden", "true")
    render(<Spinner label="Loading data" />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading data")
  })

  it("Skeleton presets expose a busy status region with label", () => {
    render(
      <>
        <Skeleton className="h-2" />
        <SkeletonLines lines={2} label="lines" />
        <SkeletonCard label="card" />
        <SkeletonTable rows={2} columns={2} />
      </>,
    )
    const regions = screen.getAllByRole("status")
    expect(regions).toHaveLength(3)
    regions.forEach((r) => expect(r).toHaveAttribute("aria-busy", "true"))
    expect(screen.getByText("lines")).toHaveClass("sr-only")
  })

  it("EmptyState renders heading level, description, icon and action", () => {
    render(
      <EmptyState
        title="Nothing here"
        description="Add something"
        icon={<svg />}
        action={<button type="button">Create</button>}
        headingLevel={2}
        compact
      />,
    )
    expect(screen.getByRole("heading", { level: 2, name: "Nothing here" })).toBeInTheDocument()
    expect(screen.getByText("Add something")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Create" })).toBeInTheDocument()
  })

  it("EmptyState defaults to an h3 with no extras", () => {
    render(<EmptyState title="Empty" />)
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Empty")
  })

  it("VisuallyHidden renders sr-only with custom tag and class", () => {
    render(
      <>
        <VisuallyHidden>plain</VisuallyHidden>
        <VisuallyHidden as="div" className="x">
          custom
        </VisuallyHidden>
      </>,
    )
    expect(screen.getByText("plain").tagName).toBe("SPAN")
    expect(screen.getByText("custom")).toHaveClass("sr-only", "x")
    expect(screen.getByText("custom").tagName).toBe("DIV")
  })

  it("labels resolve per language and fall back to Japanese", () => {
    expect(getUiLabels("id").cancel).toBe("Batal")
    expect(getUiLabels("xx" as Language).cancel).toBe("キャンセル")
    function Probe() {
      return <span data-testid="cancel">{useUiLabels().cancel}</span>
    }
    withLang(<Probe />, "en")
    expect(screen.getByTestId("cancel")).toHaveTextContent("Cancel")
  })
})
