import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, fireEvent } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useRef, useState } from "react"
import { Modal, useModalClose, type ModalProps } from "./modal"
import { AppProviders, stubLayout } from "../__tests__/helpers"
import { LanguageProvider } from "@/lib/language-context"

stubLayout()

function renderModal(props: Partial<ModalProps> = {}) {
  const onClose = vi.fn()
  const utils = render(
    <AppProviders>
      <button type="button">opener</button>
      <Modal open onClose={onClose} title="Edit item" {...props}>
        {props.children ?? (
          <>
            <input aria-label="name" />
            <button type="button">inner</button>
          </>
        )}
      </Modal>
    </AppProviders>,
  )
  return { onClose, ...utils }
}

describe("Modal", () => {
  it("renders nothing when closed", () => {
    render(
      <AppProviders>
        <Modal open={false} onClose={() => {}} title="Hidden">
          body
        </Modal>
      </AppProviders>,
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("is a modal dialog labelled by its title and described by the description", () => {
    renderModal({ description: "Change details" })
    const dialog = screen.getByRole("dialog", { name: "Edit item" })
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAccessibleDescription("Change details")
  })

  it("moves focus to the first focusable body element on open", async () => {
    renderModal()
    await waitFor(() => expect(screen.getByRole("textbox", { name: "name" })).toHaveFocus())
  })

  it("prefers a [data-autofocus] element", async () => {
    renderModal({
      children: (
        <>
          <input aria-label="a" />
          <input aria-label="b" data-autofocus />
        </>
      ),
    })
    await waitFor(() => expect(screen.getByRole("textbox", { name: "b" })).toHaveFocus())
  })

  it("focuses initialFocusRef when given", async () => {
    function WithRef() {
      const ref = useRef<HTMLButtonElement>(null)
      return (
        <Modal open onClose={() => {}} title="t" initialFocusRef={ref}>
          <input aria-label="a" />
          <button ref={ref} type="button">
            target
          </button>
        </Modal>
      )
    }
    render(
      <AppProviders>
        <WithRef />
      </AppProviders>,
    )
    await waitFor(() => expect(screen.getByRole("button", { name: "target" })).toHaveFocus())
  })

  it("traps Tab inside the dialog (wraps last -> first and first -> last)", async () => {
    renderModal()
    const input = screen.getByRole("textbox", { name: "name" })
    await waitFor(() => expect(input).toHaveFocus())
    const close = screen.getByRole("button", { name: "Close" })
    // DOM order inside the dialog: close button (header), input, inner
    await userEvent.tab()
    expect(screen.getByRole("button", { name: "inner" })).toHaveFocus()
    await userEvent.tab()
    expect(close).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole("button", { name: "inner" })).toHaveFocus()
  })

  it("closes on Escape with reason 'escape'", async () => {
    const { onClose } = renderModal()
    await waitFor(() => expect(screen.getByRole("textbox", { name: "name" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledWith("escape")
  })

  it("ignores Escape when closeOnEsc is false", async () => {
    const { onClose } = renderModal({ closeOnEsc: false })
    await userEvent.keyboard("{Escape}")
    expect(onClose).not.toHaveBeenCalled()
  })

  it("closes via the close button with reason 'close-button'", async () => {
    const { onClose } = renderModal({ closeLabel: "Dismiss" })
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }))
    expect(onClose).toHaveBeenCalledWith("close-button")
  })

  it("hides the close button when hideCloseButton is set", () => {
    renderModal({ hideCloseButton: true })
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument()
  })

  it("closes on overlay click only when enabled and press+release both hit the backdrop", () => {
    const { onClose } = renderModal({ closeOnOverlayClick: true })
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement
    // A drag that starts inside the panel and ends on the overlay must not close.
    fireEvent.mouseDown(screen.getByRole("dialog"))
    fireEvent.mouseUp(overlay)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.mouseDown(overlay)
    fireEvent.mouseUp(overlay)
    expect(onClose).toHaveBeenCalledWith("overlay")
  })

  it("does not close on overlay click by default", () => {
    const { onClose } = renderModal()
    const overlay = screen.getByRole("dialog").parentElement as HTMLElement
    fireEvent.mouseDown(overlay)
    fireEvent.mouseUp(overlay)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("locks body scroll while open and restores it on unmount", () => {
    const { unmount } = renderModal()
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.body.style.overflow).toBe("")
  })

  it("restores focus to the previously focused element after closing", async () => {
    function Toggle() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            open
          </button>
          <Modal open={open} onClose={() => setOpen(false)} title="T">
            <input aria-label="x" />
          </Modal>
        </>
      )
    }
    render(
      <AppProviders>
        <Toggle />
      </AppProviders>,
    )
    const opener = screen.getByRole("button", { name: "open" })
    await userEvent.click(opener)
    await waitFor(() => expect(screen.getByRole("textbox", { name: "x" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it("Escape closes only the top-most of stacked modals", async () => {
    const outer = vi.fn()
    const inner = vi.fn()
    render(
      <AppProviders>
        <Modal open onClose={outer} title="Outer">
          <input aria-label="outer-input" />
        </Modal>
        <Modal open onClose={inner} title="Inner">
          <input aria-label="inner-input" />
        </Modal>
      </AppProviders>,
    )
    await waitFor(() => expect(screen.getByRole("textbox", { name: "inner-input" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    expect(inner).toHaveBeenCalledWith("escape")
    expect(outer).not.toHaveBeenCalled()
  })

  describe("isDirty guard", () => {
    it("asks before closing and keeps the modal open when the user cancels", async () => {
      const { onClose } = renderModal({ isDirty: true })
      await waitFor(() => expect(screen.getByRole("textbox", { name: "name" })).toHaveFocus())
      await userEvent.keyboard("{Escape}")
      expect(await screen.findByRole("alertdialog", { name: "Unsaved changes" })).toBeInTheDocument()
      // Escape now belongs to the confirm dialog (top-most layer) and only cancels it.
      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
      await userEvent.keyboard("{Escape}")
      await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument())
      expect(onClose).not.toHaveBeenCalled()
      expect(screen.getByRole("dialog", { name: "Edit item" })).toBeInTheDocument()
    })

    it("closes after the user confirms discarding", async () => {
      const { onClose } = renderModal({ isDirty: true, dirtyConfirm: { confirmLabel: "Throw away" } })
      await userEvent.click(screen.getByRole("button", { name: "Close" }))
      await userEvent.click(await screen.findByRole("button", { name: "Throw away" }))
      await waitFor(() => expect(onClose).toHaveBeenCalledWith("close-button"))
    })

    it("falls back to window.confirm without a ConfirmProvider", async () => {
      const spy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true)
      const onClose = vi.fn()
      render(
        <LanguageProvider initialLanguage="en">
          <Modal open onClose={onClose} title="T" isDirty>
            x
          </Modal>
        </LanguageProvider>,
      )
      const close = screen.getByRole("button", { name: "Close" })
      await userEvent.click(close)
      expect(onClose).not.toHaveBeenCalled()
      await userEvent.click(close)
      await waitFor(() => expect(onClose).toHaveBeenCalledWith("close-button"))
      expect(spy).toHaveBeenCalledWith("Your changes have not been saved. Discard them and close?")
      spy.mockRestore()
    })
  })

  it("useModalClose provides a guarded close to footer buttons", async () => {
    function Footer() {
      const close = useModalClose()
      return (
        <button type="button" onClick={close}>
          Cancel edit
        </button>
      )
    }
    const { onClose } = renderModal({ footer: <Footer />, headerActions: <span>extra</span>, size: "xl" })
    expect(screen.getByText("extra")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Cancel edit" }))
    expect(onClose).toHaveBeenCalledWith("request")
  })

  it("useModalClose throws outside a Modal", () => {
    function Bad() {
      useModalClose()
      return null
    }
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<Bad />)).toThrow(/inside <Modal>/)
    err.mockRestore()
  })
})
