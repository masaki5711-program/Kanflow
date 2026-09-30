import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemberPicker, type UserSearchResult } from "./member-picker"
import { AppProviders, jsonResponse } from "./__tests__/helpers"
import { getTranslations } from "@/lib/i18n"

const t = getTranslations("en")
const ROLE_PT = { rolePO: "PO", roleSM: "SM", roleDev: "Dev" }

const USERS: UserSearchResult[] = [
  { id: "u1", name: "Alice", email: "a@x", employeeNumber: "E1", department: "R&D", isMember: false },
  { id: "u2", name: "Bob", email: "b@x", employeeNumber: null, department: null, isMember: true },
  { id: "u3", name: "Carol", email: "c@x", employeeNumber: null, department: "QA", isMember: false },
]

let searchStatus = 200
let addStatus = 200
let addBodies: unknown[] = []
let searchUrls: string[] = []

beforeEach(() => {
  searchStatus = 200
  addStatus = 200
  addBodies = []
  searchUrls = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        addBodies.push(JSON.parse(String(init.body)))
        return addStatus === 200 ? jsonResponse({ ok: true }) : jsonResponse({ error: "forbidden" }, addStatus)
      }
      searchUrls.push(url)
      return searchStatus === 200 ? jsonResponse(USERS) : jsonResponse({ error: "search down" }, searchStatus)
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

function renderPicker() {
  const onAdded = vi.fn()
  render(
    <AppProviders>
      <MemberPicker projectId="p1" onAdded={onAdded} rolePT={ROLE_PT} />
      <button type="button">elsewhere</button>
    </AppProviders>,
  )
  return { onAdded, input: screen.getByRole("combobox", { name: t.memberPickerSearchLabel }) }
}

describe("MemberPicker", () => {
  it("asks for more characters before searching", async () => {
    const { input } = renderPicker()
    await userEvent.type(input, "a")
    expect(input).toHaveAttribute("aria-expanded", "true")
    expect(screen.getAllByText(t.memberPickerEmpty).length).toBeGreaterThan(0)
    expect(searchUrls).toEqual([])
  })

  it("debounces the search, lists results and disables existing members", async () => {
    const { input } = renderPicker()
    await userEvent.type(input, "al")
    expect(await screen.findByRole("button", { name: /Alice/ })).toBeEnabled()
    expect(searchUrls).toEqual(["/api/users/search?q=al&excludeProjectId=p1"])
    expect(screen.getByRole("button", { name: /Bob/ })).toBeDisabled()
    expect(screen.getByText(t.memberPickerAlreadyAdded)).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: t.memberPickerSearchLabel })).toHaveAccessibleDescription(
      t.memberPickerResults.replace("{count}", "3"),
    )
  })

  it("supports keyboard navigation between input and results", async () => {
    const { input } = renderPicker()
    await userEvent.type(input, "al")
    const alice = await screen.findByRole("button", { name: /Alice/ })
    await userEvent.keyboard("{ArrowDown}")
    expect(alice).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(screen.getByRole("button", { name: /Carol/ })).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}")
    expect(alice).toHaveFocus()
    await userEvent.keyboard("{ArrowUp}")
    expect(input).toHaveFocus()
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowUp}")
    expect(alice).toHaveFocus()
    // regression: Escape in the list must close the popup (refocusing the input used to re-open it)
    await userEvent.keyboard("{Escape}")
    expect(input).toHaveFocus()
    expect(input).toHaveAttribute("aria-expanded", "false")
  })

  it("selects users as chips, removes them, and adds the selection with a role", async () => {
    const { input, onAdded } = renderPicker()
    await userEvent.type(input, "al")
    await userEvent.click(await screen.findByRole("button", { name: /Alice/ }))
    expect(input).toHaveValue("")
    expect(input).toHaveFocus()
    await userEvent.type(input, "ca")
    await userEvent.click(await screen.findByRole("button", { name: /Carol/ }))
    await userEvent.click(screen.getByRole("button", { name: t.memberPickerRemove.replace("{name}", "Carol") }))
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.memberPickerRole }), "sm")
    await userEvent.click(screen.getByRole("button", { name: t.memberPickerAddSelected }))
    await waitFor(() => expect(onAdded).toHaveBeenCalled())
    expect(addBodies).toEqual([{ userIds: ["u1"], role: "sm" }])
    expect(screen.queryByRole("button", { name: t.memberPickerAddSelected })).not.toBeInTheDocument()
  })

  it("toasts search and add failures", async () => {
    searchStatus = 500
    addStatus = 403
    const { input, onAdded } = renderPicker()
    await userEvent.type(input, "zz")
    expect(await screen.findByText("search down")).toBeInTheDocument()
    expect(screen.getAllByText(t.userNoResults).length).toBeGreaterThan(0)

    searchStatus = 200
    await userEvent.clear(input)
    await userEvent.type(input, "al")
    await userEvent.click(await screen.findByRole("button", { name: /Alice/ }))
    await userEvent.click(screen.getByRole("button", { name: t.memberPickerAddSelected }))
    expect(await screen.findByText("forbidden")).toBeInTheDocument()
    expect(onAdded).not.toHaveBeenCalled()
  })

  it("closes the dropdown on Escape and on outside click", async () => {
    const { input } = renderPicker()
    await userEvent.type(input, "a")
    await userEvent.keyboard("{Escape}")
    expect(input).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(screen.getByRole("button", { name: "elsewhere" }))
    await userEvent.click(input)
    expect(input).toHaveAttribute("aria-expanded", "true")
    fireEvent.mouseDown(screen.getByRole("button", { name: "elsewhere" }))
    expect(input).toHaveAttribute("aria-expanded", "false")
  })

  it("re-opens the results when typing (or ArrowDown) after Escape closed them", async () => {
    const { input } = renderPicker()
    await userEvent.type(input, "al")
    expect(input).toHaveAttribute("aria-expanded", "true")
    await userEvent.keyboard("{Escape}")
    expect(input).toHaveAttribute("aria-expanded", "false")
    await userEvent.keyboard("i")
    expect(input).toHaveAttribute("aria-expanded", "true")
    expect(await screen.findByRole("button", { name: /Alice/ })).toBeInTheDocument()
    await userEvent.keyboard("{Escape}")
    expect(input).toHaveAttribute("aria-expanded", "false")
    await userEvent.keyboard("{ArrowDown}")
    expect(input).toHaveAttribute("aria-expanded", "true")
  })
})
