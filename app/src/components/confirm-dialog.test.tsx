import { describe, expect, it } from "vitest"
import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useEffect, useState } from "react"
import { ConfirmProvider, useConfirm, useOptionalConfirm, type ConfirmOptions } from "./confirm-dialog"
import { LanguageProvider } from "@/lib/language-context"
import { stubLayout } from "./__tests__/helpers"

stubLayout()

function Harness({ options, onResult }: { options: ConfirmOptions; onResult: (v: boolean) => void }) {
  const confirm = useConfirm()
  return (
    <button type="button" onClick={async () => onResult(await confirm(options))}>
      trigger
    </button>
  )
}

function renderHarness(options: ConfirmOptions = { message: "Delete it?" }) {
  const results: boolean[] = []
  render(
    <LanguageProvider initialLanguage="en">
      <ConfirmProvider>
        <Harness options={options} onResult={(v) => results.push(v)} />
      </ConfirmProvider>
    </LanguageProvider>,
  )
  return { results, trigger: screen.getByRole("button", { name: "trigger" }) }
}

describe("ConfirmDialog", () => {
  it("opens an alertdialog labelled by its title and described by its message", async () => {
    // Arrange
    const { trigger } = renderHarness({ title: "Remove", message: "Really remove?" })
    // Act
    await userEvent.click(trigger)
    // Assert
    const dialog = screen.getByRole("alertdialog", { name: "Remove" })
    expect(dialog).toHaveAttribute("aria-modal", "true")
    expect(dialog).toHaveAccessibleDescription("Really remove?")
  })

  it("uses the message as the accessible name when there is no title", async () => {
    const { trigger } = renderHarness({ message: "Only a message" })
    await userEvent.click(trigger)
    expect(screen.getByRole("alertdialog", { name: "Only a message" })).toBeInTheDocument()
  })

  it("focuses the Cancel button initially", async () => {
    const { trigger } = renderHarness()
    await userEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
  })

  it("regression: pressing Enter while Cancel is focused cancels and does NOT confirm", async () => {
    // Arrange
    const { trigger, results } = renderHarness()
    await userEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    // Act
    await userEvent.keyboard("{Enter}")
    // Assert
    await waitFor(() => expect(results).toEqual([false]))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("confirms with true when the confirm button is clicked", async () => {
    const { trigger, results } = renderHarness({ message: "m", confirmLabel: "Yes, delete" })
    await userEvent.click(trigger)
    await userEvent.click(screen.getByRole("button", { name: "Yes, delete" }))
    await waitFor(() => expect(results).toEqual([true]))
  })

  it("Enter on the focused confirm button confirms", async () => {
    const { trigger, results } = renderHarness({ message: "m" })
    await userEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    await userEvent.tab()
    expect(screen.getByRole("button", { name: "OK" })).toHaveFocus()
    await userEvent.keyboard("{Enter}")
    await waitFor(() => expect(results).toEqual([true]))
  })

  it("Escape cancels and resolves false", async () => {
    const { trigger, results } = renderHarness()
    await userEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(results).toEqual([false]))
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument()
  })

  it("restores focus to the trigger after closing", async () => {
    const { trigger } = renderHarness()
    await userEvent.click(trigger)
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus())
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    await waitFor(() => expect(trigger).toHaveFocus())
  })

  it("traps Tab focus between Cancel and confirm", async () => {
    const { trigger } = renderHarness()
    await userEvent.click(trigger)
    const cancel = screen.getByRole("button", { name: "Cancel" })
    await waitFor(() => expect(cancel).toHaveFocus())
    await userEvent.tab()
    await userEvent.tab()
    expect(cancel).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(screen.getByRole("button", { name: "OK" })).toHaveFocus()
  })

  it("locks body scroll while open and unlocks after close", async () => {
    const { trigger } = renderHarness()
    await userEvent.click(trigger)
    expect(document.body.style.overflow).toBe("hidden")
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }))
    expect(document.body.style.overflow).toBe("")
  })

  it.each(["danger", "warning", "info"] as const)("renders the %s variant", async (variant) => {
    const { trigger } = renderHarness({ message: "m", variant })
    await userEvent.click(trigger)
    expect(screen.getByRole("alertdialog")).toBeInTheDocument()
  })

  it("resolves a superseded pending request as cancelled", async () => {
    // Arrange
    const results: boolean[] = []
    let confirmFn: ((o: ConfirmOptions) => Promise<boolean>) | null = null
    function Capture({ onValue }: { onValue: (fn: (o: ConfirmOptions) => Promise<boolean>) => void }) {
      const fn = useConfirm()
      useEffect(() => {
        onValue(fn)
      })
      return null
    }
    render(
      <ConfirmProvider>
        <Capture
          onValue={(fn) => {
            confirmFn = fn
          }}
        />
      </ConfirmProvider>,
    )
    // Act
    await act(async () => {
      void confirmFn!({ message: "first" }).then((v) => results.push(v))
    })
    await act(async () => {
      void confirmFn!({ message: "second" }).then((v) => results.push(v))
    })
    // Assert
    expect(results).toEqual([false])
    expect(screen.getByRole("alertdialog", { name: "second" })).toBeInTheDocument()
  })

  it("useConfirm throws outside the provider", () => {
    function Bad() {
      useConfirm()
      return null
    }
    expect(() => render(<Bad />)).toThrow(/ConfirmProvider/)
  })

  it("useOptionalConfirm returns null outside the provider", () => {
    let value: unknown = "unset"
    function Probe({ onValue }: { onValue: (v: unknown) => void }) {
      const v = useOptionalConfirm()
      useEffect(() => {
        onValue(v)
      })
      return null
    }
    render(
      <Probe
        onValue={(v) => {
          value = v
        }}
      />,
    )
    expect(value).toBeNull()
  })

  it("keeps a local state change after confirm (sanity)", async () => {
    function Stateful() {
      const confirm = useConfirm()
      const [n, setN] = useState(0)
      return (
        <button type="button" onClick={async () => (await confirm({ message: "go" })) && setN((x) => x + 1)}>
          count {n}
        </button>
      )
    }
    render(
      <ConfirmProvider>
        <Stateful />
      </ConfirmProvider>,
    )
    await userEvent.click(screen.getByRole("button", { name: "count 0" }))
    await userEvent.click(screen.getByRole("button", { name: "OK" }))
    expect(await screen.findByRole("button", { name: "count 1" })).toBeInTheDocument()
  })
})
