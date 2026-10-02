import { beforeAll, describe, expect, it, vi } from "vitest"
import { fireEvent, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { IceboxFilePicker } from "../icebox-file-picker"
import { MAX_ATTACHMENTS } from "../types"

const t = tr("ja")

// jsdom has no object URL implementation; the component only needs stable fake URLs.
beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:fake")
  URL.revokeObjectURL = vi.fn()
})

function renderPicker(files: File[] = [], opts: { disabled?: boolean } = {}) {
  const onChange = vi.fn()
  const onTooMany = vi.fn()
  const utils = renderWithProviders(<IceboxFilePicker files={files} onChange={onChange} disabled={opts.disabled} onTooMany={onTooMany} />)
  return { onChange, onTooMany, ...utils }
}

function fileInput(container: HTMLElement) {
  return container.querySelector('input[type="file"]') as HTMLInputElement
}

describe("IceboxFilePicker", () => {
  it("renders the empty state with the drop hint and zero count", () => {
    renderPicker()
    expect(screen.getByText(t.iceboxAttachDrop)).toBeInTheDocument()
    expect(screen.getByText(t.iceboxAttachmentHint.replace("{count}", "0"))).toBeInTheDocument()
  })

  it("lists chosen files with size and a remove button per file", () => {
    const files = [new File(["x"], "a.txt", { type: "text/plain" }), new File(["y"], "b.png", { type: "image/png" })]
    renderPicker(files)
    expect(screen.getByText("a.txt")).toBeInTheDocument()
    expect(screen.getByText("b.png")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.iceboxAttachRemove.replace("{name}", "a.txt") })).toBeInTheDocument()
  })

  it("adds files chosen via the hidden input, appending to the existing list", async () => {
    const { onChange } = renderPicker([new File(["x"], "old.txt")])
    const input = fileInput(screen.getByRole("group"))
    const added = new File(["y"], "new.txt")
    fireEvent.change(input, { target: { files: [added] } })
    expect(onChange).toHaveBeenCalledWith([expect.objectContaining({ name: "old.txt" }), added])
  })

  it("removes a file by index", async () => {
    const user = userEvent.setup()
    const files = [new File(["x"], "a.txt"), new File(["y"], "b.txt")]
    const { onChange } = renderPicker(files)
    await user.click(screen.getByRole("button", { name: t.iceboxAttachRemove.replace("{name}", "a.txt") }))
    expect(onChange).toHaveBeenCalledWith([files[1]])
  })

  it("caps additions at MAX_ATTACHMENTS and reports the overflow via onTooMany", () => {
    const existing = Array.from({ length: MAX_ATTACHMENTS - 1 }, (_, i) => new File(["x"], `f${i}.txt`))
    const { onChange, onTooMany } = renderPicker(existing)
    const input = fileInput(screen.getByRole("group"))
    const incoming = [new File(["a"], "a.txt"), new File(["b"], "b.txt")]
    fireEvent.change(input, { target: { files: incoming } })
    expect(onTooMany).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith([...existing, incoming[0]])
  })

  it("does nothing when already full (no room) but still reports too many", () => {
    const existing = Array.from({ length: MAX_ATTACHMENTS }, (_, i) => new File(["x"], `f${i}.txt`))
    const { onChange, onTooMany } = renderPicker(existing)
    const input = fileInput(screen.getByRole("group"))
    fireEvent.change(input, { target: { files: [new File(["a"], "a.txt")] } })
    expect(onTooMany).toHaveBeenCalled()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: (n) => n.includes(t.iceboxAttachDrop) })).toBeDisabled()
  })

  it("disables the dropzone button and remove buttons when disabled", () => {
    renderPicker([new File(["x"], "a.txt")], { disabled: true })
    expect(screen.getByRole("button", { name: (n) => n.includes(t.iceboxAttachDrop) })).toBeDisabled()
    expect(screen.getByRole("button", { name: t.iceboxAttachRemove.replace("{name}", "a.txt") })).toBeDisabled()
  })

  it("shows an image thumbnail for an image file and a generic icon otherwise", () => {
    const img = new File(["x"], "pic.png", { type: "image/png" })
    const doc = new File(["y"], "doc.pdf", { type: "application/pdf" })
    renderPicker([img, doc])
    expect(screen.getByRole("img", { name: "pic.png" })).toBeInTheDocument()
    expect(screen.queryByRole("img", { name: "doc.pdf" })).not.toBeInTheDocument()
  })

  it("accepts a drop of files onto the dropzone", () => {
    const { onChange } = renderPicker()
    const button = screen.getByRole("button", { name: (n) => n.includes(t.iceboxAttachDrop) })
    const file = new File(["z"], "dropped.txt")
    fireEvent.dragEnter(button, { dataTransfer: { types: ["Files"], files: [file] } })
    fireEvent.drop(button, { dataTransfer: { types: ["Files"], files: [file] } })
    expect(onChange).toHaveBeenCalledWith([file])
  })
})
