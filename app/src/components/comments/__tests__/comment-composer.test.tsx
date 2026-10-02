import { describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { Modal } from "@/components/ui"
import { renderWithProviders, stubLayout } from "@/components/__tests__/helpers"
import { CommentComposer } from "../comment-composer"

stubLayout()

const t = getTranslations("en")
const MEMBERS = [
  { id: "u1", name: "Taro Yamada" },
  { id: "u2", name: "Hanako" },
  { id: "u3", name: "Takeshi" },
]

function renderComposer(props: Partial<React.ComponentProps<typeof CommentComposer>> = {}) {
  const onSubmit = vi.fn(async () => true)
  renderWithProviders(
    <CommentComposer members={MEMBERS} onSubmit={onSubmit} label="New comment" submitLabel="Send" {...props} />,
  )
  return { onSubmit: (props.onSubmit as typeof onSubmit | undefined) ?? onSubmit, box: screen.getByLabelText("New comment") }
}

describe("CommentComposer mention autocomplete", () => {
  it("lists filtered members after @ and inserts @Name (no raw token) with Enter", async () => {
    const { box } = renderComposer()
    await userEvent.type(box, "Hi @Ta")
    const list = screen.getByRole("listbox", { name: t.commentsMentionListLabel })
    const options = within(list).getAllByRole("option")
    expect(options.map((o) => o.textContent)).toEqual(["@Taro Yamada", "@Takeshi"])
    expect(options[0]).toHaveAttribute("aria-selected", "true")
    expect(box).toHaveAttribute("aria-activedescendant", options[0].id)

    await userEvent.keyboard("{ArrowDown}")
    expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{ArrowDown}")
    expect(within(list).getAllByRole("option")[0]).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{ArrowUp}")
    expect(within(list).getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true")
    await userEvent.keyboard("{Enter}")

    expect(box).toHaveValue("Hi @Takeshi ")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    await userEvent.type(box, "ok")
    expect(box).toHaveValue("Hi @Takeshi ok")
  })

  it("Tab also inserts; clicking an option inserts", async () => {
    const { box } = renderComposer()
    await userEvent.type(box, "@han")
    await userEvent.keyboard("{Tab}")
    expect(box).toHaveValue("@Hanako ")
    await userEvent.type(box, "and @Taro Y")
    await userEvent.click(screen.getByRole("option", { name: "@Taro Yamada" }))
    expect(box).toHaveValue("@Hanako and @Taro Yamada ")
  })

  it("shows a no-match note, and Escape closes the list without closing the modal", async () => {
    const onClose = vi.fn()
    const onSubmit = vi.fn(async () => true)
    renderWithProviders(
      <Modal open onClose={onClose} title="Dialog">
        <CommentComposer members={MEMBERS} onSubmit={onSubmit} label="New comment" submitLabel="Send" />
      </Modal>,
    )
    const box = screen.getByLabelText("New comment")
    await userEvent.type(box, "@zz")
    expect(screen.getByText(t.commentsMentionNoMatch)).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    // Enter now types a newline (list is closed for this @)
    await userEvent.keyboard("{Enter}")
    expect(box).toHaveValue("@zz\n")
    // A second Escape (no list) closes the modal as usual
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(onClose).toHaveBeenCalledWith("escape"))
  })

  it("does not open for e-mail addresses", async () => {
    const { box } = renderComposer()
    await userEvent.type(box, "taro@ex")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })
})

describe("CommentComposer submit", () => {
  it("Ctrl+Enter submits the trimmed text and clears on success", async () => {
    const { box, onSubmit } = renderComposer()
    await userEvent.type(box, "  hello  ")
    await userEvent.keyboard("{Control>}{Enter}{/Control}")
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("hello"))
    await waitFor(() => expect(box).toHaveValue(""))
  })

  it("keeps the text when the submit fails; the button is disabled while empty", async () => {
    const onSubmit = vi.fn(async () => false)
    const { box } = renderComposer({ onSubmit })
    const send = screen.getByRole("button", { name: "Send" })
    expect(send).toBeDisabled()
    await userEvent.type(box, "x")
    await userEvent.click(send)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("x"))
    expect(box).toHaveValue("x")
  })

  it("allowEmpty: the Send button starts enabled with no text, and submits an empty string", async () => {
    const onSubmit = vi.fn(async () => true)
    renderComposer({ onSubmit, allowEmpty: true })
    const send = screen.getByRole("button", { name: "Send" })
    expect(send).toBeEnabled()
    await userEvent.click(send)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(""))
  })

  it("allowEmpty does not bypass the over-length guard", async () => {
    renderComposer({ allowEmpty: true, initialValue: "x".repeat(10_001) })
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
  })

  it("flags text over the limit and blocks submit", async () => {
    const { box } = renderComposer({ initialValue: "x".repeat(10_001) })
    expect(screen.getByText(t.commentsTooLong.replace("{max}", "10000"))).toBeInTheDocument()
    expect(box).toHaveAttribute("aria-invalid", "true")
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled()
  })

  it("edit mode: cancel button, unchanged text cannot be saved, edited text saves without clearing", async () => {
    const onCancel = vi.fn()
    const onSubmit = vi.fn(async () => true)
    const { box } = renderComposer({ initialValue: "old", onCancel, onSubmit, submitLabel: "Save" })
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.type(box, "!")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith("old!"))
    expect(box).toHaveValue("old!")
    await userEvent.click(screen.getByRole("button", { name: t.commentsCancel }))
    expect(onCancel).toHaveBeenCalled()
  })
})

describe("mention list placement and early Enter (F-08)", () => {
  it("renders the list inside the surrounding dialog, outside the scrolling body", async () => {
    renderWithProviders(
      <Modal open onClose={vi.fn()} title="Dialog">
        <CommentComposer members={MEMBERS} onSubmit={vi.fn(async () => true)} label="New comment" submitLabel="Send" />
      </Modal>,
    )
    await userEvent.type(screen.getByLabelText("New comment"), "@Ta")
    const list = screen.getByRole("listbox", { name: t.commentsMentionListLabel })
    expect(list.parentElement).toBe(screen.getByRole("dialog"))
    expect(list.style.position).toBe("fixed")
  })

  it("mentionListStyle opens below when there is room, above near the bottom, clamped to the viewport", async () => {
    const { mentionListStyle } = await import("../mention-listbox")
    const viewport = { width: 1280, height: 720 }
    expect(mentionListStyle({ top: 100, bottom: 180, left: 40, width: 600 }, viewport)).toMatchObject({ top: 184, left: 40, width: 600, maxHeight: 240 })
    const above = mentionListStyle({ top: 560, bottom: 640, left: 900, width: 600 }, viewport)
    expect(above).toMatchObject({ bottom: 164, maxHeight: 240, left: 672 })
    expect(above.top).toBeUndefined()
  })

  it("Enter on an @token before the members load keeps the text and inserts the first match once they arrive", async () => {
    const onSubmit = vi.fn(async () => true)
    const { rerender } = renderWithProviders(
      <CommentComposer members={[]} membersLoading onSubmit={onSubmit} label="New comment" submitLabel="Send" />,
    )
    const box = screen.getByLabelText("New comment")
    await userEvent.type(box, "Hi @Han")
    expect(screen.getByRole("listbox")).toHaveTextContent(t.loading)
    await userEvent.keyboard("{Enter}")
    await userEvent.keyboard("{Control>}{Enter}{/Control}")
    expect(box).toHaveValue("Hi @Han")
    expect(onSubmit).not.toHaveBeenCalled()
    rerender(<CommentComposer members={MEMBERS} onSubmit={onSubmit} label="New comment" submitLabel="Send" />)
    await waitFor(() => expect(box).toHaveValue("Hi @Hanako "))
  })
  it("Enter on an open @token without a match does not type a newline (cycle 2)", async () => {
    const { box } = renderComposer()
    await userEvent.type(box, "@zz")
    await userEvent.keyboard("{Enter}")
    expect(box).toHaveValue("@zz")
  })

  it("a multi-word query ('@Taro Y') + immediate Enter inserts the mention, not a newline", async () => {
    const { box } = renderComposer()
    await userEvent.type(box, "@Taro Y{Enter}")
    expect(box).toHaveValue("@Taro Yamada ")
  })

  it("after Escape and clearing the text, a new @ at the same place opens the list again (cycle 2 repro)", async () => {
    const { box } = renderComposer()
    await userEvent.type(box, "@Ta")
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    await userEvent.clear(box)
    await userEvent.type(box, "@Tak{Enter}")
    expect(box).toHaveValue("@Takeshi ")
  })
})

describe("CommentComposer shows mentions as @Name and stores tokens (A3-20)", () => {
  it("submits picked mentions as bracket tokens while the text area shows plain @Name", async () => {
    const { box, onSubmit } = renderComposer()
    await userEvent.type(box, "@Taro Y{Enter}")
    await userEvent.type(box, "and @han{Tab}please check")
    expect(box).toHaveValue("@Taro Yamada and @Hanako please check")
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
    await userEvent.keyboard("{Control>}{Enter}{/Control}")
    expect(onSubmit).toHaveBeenCalledWith("@[Taro Yamada] and @[Hanako] please check")
  })

  it("editing an existing comment shows its tokens as @Name and saves them back unchanged", async () => {
    const onSubmit = vi.fn(async () => true)
    renderWithProviders(
      <CommentComposer members={MEMBERS} onSubmit={onSubmit} label="Edit" submitLabel="Save" initialValue="Hi @[Taro Yamada], ok?" />,
    )
    const box = screen.getByLabelText("Edit")
    expect(box).toHaveValue("Hi @Taro Yamada, ok?")
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
    await userEvent.type(box, "!")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    expect(onSubmit).toHaveBeenCalledWith("Hi @[Taro Yamada], ok?!")
  })
})
