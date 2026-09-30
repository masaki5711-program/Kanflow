import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import FixedTasksModal, { type FixedTaskGroup } from "../fixed-tasks-modal"
import { AppProviders, jsonResponse, stubLayout } from "../__tests__/helpers"
import { getTranslations } from "@/lib/i18n"

stubLayout()
const t = getTranslations("en")

let groups: FixedTaskGroup[]
let calls: { url: string; method: string; body: unknown }[]
let failNext: string | null

beforeEach(() => {
  groups = [
    { id: "g1", taskName: "Meetings", sortOrder: 0, items: [{ id: "i1", taskName: "Daily", sortOrder: 0 }] },
    { id: "g2", taskName: "Admin", sortOrder: 1, items: [] },
  ]
  calls = []
  failNext = null
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      const body = init?.body ? JSON.parse(String(init.body)) : undefined
      calls.push({ url, method, body })
      if (failNext && method === failNext) {
        failNext = null
        return jsonResponse({ error: `${method} failed` }, 500)
      }
      if (method === "GET") return jsonResponse(groups)
      if (method === "POST" && url.endsWith("/items")) return jsonResponse({ id: "i-new", taskName: body.taskName, sortOrder: 9 })
      if (method === "POST") return jsonResponse({ id: "g-new", taskName: body.taskName, sortOrder: 9 })
      if (method === "PATCH") return jsonResponse({ id: "x", taskName: body.taskName, sortOrder: 0 })
      return jsonResponse({ ok: true })
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderModal() {
  const onClose = vi.fn()
  render(
    <AppProviders>
      <FixedTasksModal open onClose={onClose} />
    </AppProviders>,
  )
  await screen.findByText("Meetings")
  return { onClose, dialog: screen.getByRole("dialog", { name: t.fixedTasksTitle }) }
}

function groupRow(name: string): HTMLElement {
  return screen.getByText(name).closest("li") as HTMLElement
}

describe("FixedTasksModal", () => {
  it("renders nothing when closed and shows an empty state with no groups", async () => {
    const { unmount } = render(
      <AppProviders>
        <FixedTasksModal open={false} onClose={() => {}} />
      </AppProviders>,
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    unmount()
    groups = []
    render(
      <AppProviders>
        <FixedTasksModal open onClose={() => {}} />
      </AppProviders>,
    )
    expect(await screen.findByText(t.fixedTasksEmpty)).toBeInTheDocument()
  })

  it("lists groups, expands them (aria-expanded/controls) and closes via the footer", async () => {
    const { onClose } = await renderModal()
    const toggle = within(groupRow("Meetings")).getByRole("button", { name: t.fixedTasksExpand })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(toggle.getAttribute("aria-controls")!)).toHaveTextContent("Daily")
    await userEvent.click(toggle)
    expect(screen.queryByText("Daily")).not.toBeInTheDocument()
    const closes = screen.getAllByRole("button", { name: t.close })
    await userEvent.click(closes[closes.length - 1])
    expect(onClose).toHaveBeenCalled()
  })

  it("adds a group and expands it; toasts failures", async () => {
    await renderModal()
    const input = screen.getByRole("textbox", { name: t.fixedTasksGroupNameLabel })
    const add = screen.getAllByRole("button", { name: t.fixedTasksAdd }).at(-1)!
    expect(add).toBeDisabled()
    await userEvent.type(input, "  Support  ")
    await userEvent.click(add)
    expect(await screen.findByText("Support")).toBeInTheDocument()
    expect(input).toHaveValue("")
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({ taskName: "Support" })
    expect(screen.getByText(t.fixedTasksItemEmpty)).toBeInTheDocument()

    failNext = "POST"
    await userEvent.type(input, "Broken{Enter}")
    expect(await screen.findByText("POST failed")).toBeInTheDocument()
  })

  it("renames a group inline; Escape cancels without closing the dialog", async () => {
    const { onClose } = await renderModal()
    const row = groupRow("Admin")
    await userEvent.click(within(row).getByRole("button", { name: `${t.edit}: Admin` }))
    const edit = within(row).getByRole("textbox", { name: t.fixedTasksGroupNameLabel })
    await waitFor(() => expect(edit).toHaveFocus())
    expect(edit).toHaveValue("Admin")
    // Escape must only cancel the inline editor, not close the surrounding Modal.
    await userEvent.keyboard("{Escape}")
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument()
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole("dialog")).toBeInTheDocument()

    await userEvent.click(within(row).getByRole("button", { name: `${t.edit}: Admin` }))
    const edit2 = within(row).getByRole("textbox")
    await userEvent.clear(edit2)
    await userEvent.type(edit2, "Admin work{Enter}")
    expect(await screen.findByText("Admin work")).toBeInTheDocument()
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/user/fixed-tasks/g2", body: { taskName: "Admin work" } })
  })

  it("inline edit with an unchanged name just cancels; failures keep the editor open", async () => {
    await renderModal()
    const row = groupRow("Admin")
    await userEvent.click(within(row).getByRole("button", { name: `${t.edit}: Admin` }))
    await userEvent.click(within(row).getByRole("button", { name: t.update }))
    expect(calls.filter((c) => c.method === "PATCH")).toEqual([])
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument()
    await userEvent.click(within(row).getByRole("button", { name: `${t.edit}: Admin` }))
    await userEvent.click(within(row).getByRole("button", { name: t.cancel }))
    expect(within(row).queryByRole("textbox")).not.toBeInTheDocument()

    failNext = "PATCH"
    await userEvent.click(within(row).getByRole("button", { name: `${t.edit}: Admin` }))
    await userEvent.type(within(row).getByRole("textbox"), "X{Enter}")
    expect(await screen.findByText("PATCH failed")).toBeInTheDocument()
    expect(within(row).getByRole("textbox")).toBeInTheDocument()
  })

  it("deletes a group after confirmation only", async () => {
    await renderModal()
    await userEvent.click(within(groupRow("Admin")).getByRole("button", { name: `${t.delete}: Admin` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.cancel }))
    expect(screen.getByText("Admin")).toBeInTheDocument()

    failNext = "DELETE"
    await userEvent.click(within(groupRow("Admin")).getByRole("button", { name: `${t.delete}: Admin` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    expect(await screen.findByText("DELETE failed")).toBeInTheDocument()

    await userEvent.click(within(groupRow("Admin")).getByRole("button", { name: `${t.delete}: Admin` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(screen.queryByText("Admin")).not.toBeInTheDocument())
  })

  it("adds, renames and deletes child items", async () => {
    await renderModal()
    await userEvent.click(within(groupRow("Meetings")).getByRole("button", { name: t.fixedTasksExpand }))
    const itemInput = screen.getByRole("textbox", { name: t.fixedTasksItemNameLabel })
    await userEvent.type(itemInput, "Retro{Enter}")
    expect(await screen.findByText("Retro")).toBeInTheDocument()

    failNext = "POST"
    await userEvent.type(itemInput, "Oops{Enter}")
    expect(await screen.findByText("POST failed")).toBeInTheDocument()
    await userEvent.clear(itemInput)

    const daily = screen.getByText("Daily").closest("li") as HTMLElement
    await userEvent.click(within(daily).getByRole("button", { name: `${t.edit}: Daily` }))
    const edit = within(daily).getByRole("textbox")
    await userEvent.clear(edit)
    await userEvent.type(edit, "Standup{Enter}")
    expect(await screen.findByText("Standup")).toBeInTheDocument()

    failNext = "PATCH"
    const standup = screen.getByText("Standup").closest("li") as HTMLElement
    await userEvent.click(within(standup).getByRole("button", { name: `${t.edit}: Standup` }))
    await userEvent.type(within(standup).getByRole("textbox"), "!{Enter}")
    expect(await screen.findByText("PATCH failed")).toBeInTheDocument()
    await userEvent.click(within(standup).getByRole("button", { name: t.cancel }))

    const retro = screen.getByText("Retro").closest("li") as HTMLElement
    await userEvent.click(within(retro).getByRole("button", { name: `${t.delete}: Retro` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.cancel }))
    expect(screen.getByText("Retro")).toBeInTheDocument()

    failNext = "DELETE"
    await userEvent.click(within(retro).getByRole("button", { name: `${t.delete}: Retro` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    expect(await screen.findByText("DELETE failed")).toBeInTheDocument()

    await userEvent.click(within(retro).getByRole("button", { name: `${t.delete}: Retro` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.delete }))
    await waitFor(() => expect(screen.queryByText("Retro")).not.toBeInTheDocument())
  })
})
