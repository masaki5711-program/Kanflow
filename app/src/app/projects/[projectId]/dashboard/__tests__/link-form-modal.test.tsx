import { describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { renderWithProviders, tr } from "@/app/__tests__/test-utils"
import { LinkFormModal } from "../link-form-modal"
import type { Attachment } from "../types"
import type { LinkFormState } from "../use-attachments"

const t = tr("ja")

function renderModal(form: LinkFormState, opts: { onSave?: (name: string, url: string) => Promise<boolean>; folderName?: string | null } = {}) {
  const onSave = vi.fn(opts.onSave ?? (async () => true))
  const onClose = vi.fn()
  renderWithProviders(<LinkFormModal form={form} folderName={opts.folderName ?? null} onSave={onSave} onClose={onClose} />)
  return { onSave, onClose }
}

const link = (overrides: Partial<Attachment> = {}): Attachment => ({
  id: "lnk1",
  originalName: "group/repo",
  fileName: "",
  fileSize: 0,
  mimeType: "text/x-uri",
  folderId: null,
  createdAt: "2026-01-01T00:00:00Z",
  linkUrl: "https://gitlab.example.com/group/repo",
  ...overrides,
})

describe("LinkFormModal", () => {
  it("create mode: title, empty fields, save disabled until a valid URL is entered", () => {
    renderModal({ mode: "create", folderId: null })
    expect(screen.getByRole("heading", { name: t.attLinkFormTitle })).toBeInTheDocument()
    expect(screen.getByLabelText(t.attLinkUrl, { exact: false })).toHaveValue("")
    expect(screen.getByLabelText(t.attLinkName)).toHaveValue("")
    expect(screen.getByRole("button", { name: t.attLinkSave })).toBeDisabled()
  })

  it("auto-fills the name from a pasted/typed URL until the user edits the name", async () => {
    const user = userEvent.setup()
    renderModal({ mode: "create", folderId: null })
    await user.type(screen.getByLabelText(t.attLinkUrl, { exact: false }), "https://gitlab.example.com/group/repo")
    expect(screen.getByLabelText(t.attLinkName)).toHaveValue("group/repo")
    expect(screen.getByRole("button", { name: t.attLinkSave })).toBeEnabled()

    // Once the user edits the name by hand, further URL changes stop overwriting it.
    await user.clear(screen.getByLabelText(t.attLinkName))
    await user.type(screen.getByLabelText(t.attLinkName), "My custom name")
    await user.type(screen.getByLabelText(t.attLinkUrl, { exact: false }), "/-/tree/main")
    expect(screen.getByLabelText(t.attLinkName)).toHaveValue("My custom name")
  })

  it("shows a validation error and keeps save disabled for an invalid URL once touched", async () => {
    const user = userEvent.setup()
    renderModal({ mode: "create", folderId: null })
    const urlInput = screen.getByLabelText(t.attLinkUrl, { exact: false })
    await user.type(urlInput, "javascript:alert(1)")
    await user.tab()
    expect(screen.getByText(t.attLinkUrlInvalid)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: t.attLinkSave })).toBeDisabled()
  })

  it("shows the target folder name in the description when creating inside a folder", () => {
    renderModal({ mode: "create", folderId: "f1" }, { folderName: "Docs" })
    expect(screen.getByText(t.folderCreateIn.replace("{name}", "Docs"))).toBeInTheDocument()
  })

  it("edit mode: prefilled from the existing link, title says edit", () => {
    renderModal({ mode: "edit", file: link() })
    expect(screen.getByRole("heading", { name: t.attLinkEditTitle })).toBeInTheDocument()
    expect(screen.getByLabelText(t.attLinkUrl, { exact: false })).toHaveValue("https://gitlab.example.com/group/repo")
    expect(screen.getByLabelText(t.attLinkName)).toHaveValue("group/repo")
    expect(screen.getByRole("button", { name: t.attLinkSave })).toBeEnabled()
  })

  it("edit mode: falls back to an empty URL when the existing link has none set", () => {
    renderModal({ mode: "edit", file: link({ linkUrl: null }) })
    expect(screen.getByLabelText(t.attLinkUrl, { exact: false })).toHaveValue("")
  })

  it("edit mode: changing the URL does not overwrite the already-set name", async () => {
    const user = userEvent.setup()
    renderModal({ mode: "edit", file: link() })
    const urlInput = screen.getByLabelText(t.attLinkUrl, { exact: false })
    await user.clear(urlInput)
    await user.type(urlInput, "https://gitlab.example.com/other/thing")
    expect(screen.getByLabelText(t.attLinkName)).toHaveValue("group/repo")
  })

  it("submits trimmed name/url and closes on success", async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderModal({ mode: "create", folderId: null })
    await user.type(screen.getByLabelText(t.attLinkUrl, { exact: false }), "  https://example.com  ")
    await user.clear(screen.getByLabelText(t.attLinkName))
    await user.type(screen.getByLabelText(t.attLinkName), "  My Link  ")
    await user.click(screen.getByRole("button", { name: t.attLinkSave }))
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("My Link", "https://example.com"))
    expect(onClose).toHaveBeenCalled()
  })

  it("stays open and keeps the form when onSave resolves false", async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderModal({ mode: "create", folderId: null }, { onSave: async () => false })
    await user.type(screen.getByLabelText(t.attLinkUrl, { exact: false }), "https://example.com")
    await user.click(screen.getByRole("button", { name: t.attLinkSave }))
    await waitFor(() => expect(onSave).toHaveBeenCalled())
    expect(onClose).not.toHaveBeenCalled()
  })

  it("does not submit on click while the URL is invalid", async () => {
    const user = userEvent.setup()
    const { onSave } = renderModal({ mode: "create", folderId: null })
    // The button is disabled, but submit() also guards against invalid state.
    expect(screen.getByRole("button", { name: t.attLinkSave })).toBeDisabled()
    await user.type(screen.getByLabelText(t.attLinkUrl, { exact: false }), "not a url")
    await user.keyboard("{Enter}")
    expect(onSave).not.toHaveBeenCalled()
  })

  it("disables the Save button (loading) while a save is in flight, and re-enables after", async () => {
    const user = userEvent.setup()
    let resolveSave!: (ok: boolean) => void
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => { resolveSave = resolve }))
    renderModal({ mode: "create", folderId: null }, { onSave })
    await user.type(screen.getByLabelText(t.attLinkUrl, { exact: false }), "https://example.com")
    const save = screen.getByRole("button", { name: t.attLinkSave })
    await user.click(save)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(save).toBeDisabled()
    resolveSave(false)
    await waitFor(() => expect(save).toBeEnabled())
  })

  it("Cancel closes without saving", async () => {
    const user = userEvent.setup()
    const { onSave, onClose } = renderModal({ mode: "create", folderId: null })
    await user.click(screen.getByRole("button", { name: t.cancel }))
    expect(onSave).not.toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
