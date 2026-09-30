import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { UserManagementBase } from "../user-management-base"
import { jsonResponse, renderWithProviders, stubLayout } from "../__tests__/helpers"
import { formFromUser, toUserRole, type ManagedUser } from "./types"
import { getTranslations } from "@/lib/i18n"

stubLayout()
const t = getTranslations("en")

function user(over: Partial<ManagedUser>): ManagedUser {
  return {
    id: "u",
    name: "User",
    email: "u@x",
    role: "member",
    isActive: true,
    createdAt: "2026-01-01",
    employeeNumber: null,
    department: null,
    _count: { memberships: 1 },
    sections: [],
    ...over,
  }
}

const USERS = [
  user({ id: "u1", name: "Alice", email: "alice@x", role: "admin", department: "R&D", employeeNumber: "E1", sections: [{ id: "s1", name: "Sec A" }] }),
  user({ id: "u2", name: "Bob", email: "bob@x", role: "section_manager", department: "QA" }),
  user({ id: "u3", name: "Carol", email: "carol@x", isActive: false }),
]

interface Call {
  url: string
  method: string
  body: unknown
}
let calls: Call[]
let failPatch: boolean
let failReset: boolean
let failCreate: boolean

beforeEach(() => {
  calls = []
  failPatch = false
  failReset = false
  failCreate = false
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
      if (url === "/api/users" && method === "GET") return jsonResponse(USERS)
      if (url === "/api/admin/sections") return jsonResponse([{ id: "s1", name: "Sec A", extra: 1 }, { id: "s2", name: "Sec B" }])
      if (url.endsWith("/reset-password")) return failReset ? jsonResponse({ error: "" }, 500) : jsonResponse({ ok: true })
      if (method === "PATCH") return failPatch ? jsonResponse({ error: "nope" }, 500) : jsonResponse({ ok: true })
      if (method === "POST") return failCreate ? jsonResponse({ error: "Email taken" }, 409) : jsonResponse({ id: "new" })
      return jsonResponse({})
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

async function renderPage() {
  renderWithProviders(<UserManagementBase headerExtra={<span>extra</span>} />)
  return await screen.findByRole("list", { name: t.userListLabel })
}

function rowOf(name: string): HTMLElement {
  return screen.getByText(name, { selector: "span" }).closest("li") as HTMLElement
}

describe("types helpers", () => {
  it("maps unknown roles to member and builds a form from a user", () => {
    expect(toUserRole("root")).toBe("member")
    expect(toUserRole("admin")).toBe("admin")
    expect(formFromUser(USERS[0])).toMatchObject({ role: "admin", employeeNumber: "E1", department: "R&D", sectionIds: ["s1"] })
  })
})

describe("UserManagementBase", () => {
  it("lists active users by default and filters by query, role, status and department", async () => {
    const list = await renderPage()
    expect(screen.getByText("extra")).toBeInTheDocument()
    expect(within(list).getAllByRole("listitem")).toHaveLength(2)
    expect(screen.getByText(`2 / 3 ${t.userCount}`)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterStatusLabel }), "all")
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
    expect(within(rowOf("Carol")).getByText(t.userInactive)).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterStatusLabel }), "inactive")
    expect(within(list).getAllByRole("listitem")).toHaveLength(1)

    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterStatusLabel }), "all")
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterRoleLabel }), "section_manager")
    expect(within(list).getAllByRole("listitem")).toHaveLength(1)
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterRoleLabel }), "all")

    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterDepartmentLabel }), "R&D")
    expect(within(list).getAllByRole("listitem")).toHaveLength(1)
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterDepartmentLabel }), "all")

    await userEvent.type(screen.getByRole("searchbox", { name: t.userSearchLabel }), "e1")
    expect(within(list).getAllByRole("listitem")).toHaveLength(1)
    await userEvent.type(screen.getByRole("searchbox", { name: t.userSearchLabel }), "zzz")
    expect(await screen.findByText(t.userNoResults)).toBeInTheDocument()
  })

  it("deactivating asks for confirmation and does nothing when cancelled", async () => {
    await renderPage()
    await userEvent.click(within(rowOf("Alice")).getByRole("button", { name: `${t.userDeactivate}: Alice` }))
    const alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: t.cancel }))
    expect(calls.filter((c) => c.method === "PATCH")).toEqual([])
  })

  it("deactivates optimistically after confirm", async () => {
    const list = await renderPage()
    await userEvent.click(within(rowOf("Alice")).getByRole("button", { name: `${t.userDeactivate}: Alice` }))
    await userEvent.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: t.userDeactivate }))
    // hidden by the default "active" filter as soon as the optimistic update applies
    await waitFor(() => expect(within(list).getAllByRole("listitem")).toHaveLength(1))
    expect(calls.find((c) => c.method === "PATCH")).toEqual({ url: "/api/users/u1", method: "PATCH", body: { isActive: false } })
    expect(await screen.findByText(t.userDeactivated)).toBeInTheDocument()
  })

  it("rolls back the optimistic toggle when the request fails", async () => {
    failPatch = true
    const list = await renderPage()
    await userEvent.selectOptions(screen.getByRole("combobox", { name: t.userFilterStatusLabel }), "all")
    await userEvent.click(within(rowOf("Carol")).getByRole("button", { name: `${t.userActivate}: Carol` }))
    expect(await screen.findByText(t.errorChangeFailed)).toBeInTheDocument()
    expect(within(rowOf("Carol")).getByText(t.userInactive)).toBeInTheDocument()
    expect(within(list).getAllByRole("listitem")).toHaveLength(3)
  })

  it("creates a user with sections and refetches the list", async () => {
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: t.userAdd }))
    const dialog = await screen.findByRole("dialog", { name: t.userCreateTitle })
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userName)), "Dave")
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userEmail)), "dave@x.com")
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userInitialPassword)), "secret12")
    await userEvent.selectOptions(within(dialog).getByLabelText(t.userRole), "section_manager")
    const secB = within(dialog).getByRole("checkbox", { name: "Sec B" })
    await userEvent.click(secB)
    await userEvent.click(within(dialog).getByRole("checkbox", { name: "Sec A" }))
    await userEvent.click(within(dialog).getByRole("checkbox", { name: /Sec A/ }))
    expect(secB).toBeChecked()
    const getsBefore = calls.filter((c) => c.url === "/api/users" && c.method === "GET").length
    await userEvent.click(within(dialog).getByRole("button", { name: t.create }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(calls.find((c) => c.method === "POST")?.body).toEqual({
      name: "Dave",
      email: "dave@x.com",
      role: "section_manager",
      employeeNumber: null,
      department: null,
      sectionIds: ["s2"],
      password: "secret12",
    })
    await waitFor(() =>
      expect(calls.filter((c) => c.url === "/api/users" && c.method === "GET").length).toBeGreaterThan(getsBefore),
    )
  })

  it("shows the server error inside the create dialog", async () => {
    failCreate = true
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: t.userAdd }))
    const dialog = await screen.findByRole("dialog", { name: t.userCreateTitle })
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userName)), "D")
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userEmail)), "d@x.com")
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userInitialPassword)), "secret12")
    await userEvent.click(within(dialog).getByRole("button", { name: t.create }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Email taken")
  })

  it("validates the create form with localized inline errors instead of browser bubbles (A3-18)", async () => {
    await renderPage()
    await userEvent.click(screen.getByRole("button", { name: t.userAdd }))
    const dialog = await screen.findByRole("dialog", { name: t.userCreateTitle })
    expect(dialog.querySelector("form")).toHaveAttribute("novalidate")
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userEmail)), "not-an-email")
    await userEvent.type(within(dialog).getByLabelText(new RegExp(t.userInitialPassword)), "1234567")
    await userEvent.click(within(dialog).getByRole("button", { name: t.create }))
    expect(await within(dialog).findByText(t.userNameRequired)).toBeInTheDocument()
    expect(within(dialog).getByText(t.userEmailInvalid)).toBeInTheDocument()
    expect(within(dialog).getByText(t.userPasswordMinError)).toBeInTheDocument()
    expect(calls.some((c) => c.method === "POST")).toBe(false)
  })

  it("edits a user (PATCH) and guards closing with unsaved changes", async () => {
    await renderPage()
    await userEvent.click(within(rowOf("Bob")).getByRole("button", { name: `${t.edit}: Bob` }))
    const dialog = await screen.findByRole("dialog", { name: t.userEditTitle })
    expect(dialog).toHaveAccessibleDescription("bob@x")
    expect(within(dialog).queryByLabelText(new RegExp(t.userInitialPassword))).not.toBeInTheDocument()
    const dept = within(dialog).getByLabelText(t.userDepartment)
    await userEvent.clear(dept)
    await userEvent.type(dept, "Ops")
    await userEvent.click(within(dialog).getByRole("button", { name: t.cancel }))
    const alert = await screen.findByRole("alertdialog")
    await userEvent.click(within(alert).getByRole("button", { name: "Cancel" }))
    await userEvent.click(within(dialog).getByRole("button", { name: t.save }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(calls.find((c) => c.method === "PATCH")).toMatchObject({ url: "/api/users/u2", body: { department: "Ops", role: "section_manager" } })
    expect(await screen.findByText(t.userUpdated)).toBeInTheDocument()
  })

  it("validates and submits a password reset", async () => {
    await renderPage()
    await userEvent.click(within(rowOf("Alice")).getByRole("button", { name: `${t.userResetPassword}: Alice` }))
    const dialog = await screen.findByRole("dialog", { name: t.userResetPassword })
    const input = within(dialog).getByLabelText(new RegExp(t.myProfileNewPassword))
    await waitFor(() => expect(input).toHaveFocus())
    await userEvent.type(input, "abc")
    // Bypass native minLength validation (jsdom enforces it on requestSubmit)
    input.removeAttribute("minLength")
    await userEvent.click(within(dialog).getByRole("button", { name: t.userReset }))
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(t.userPasswordMinError)
    expect(input).toHaveAttribute("aria-invalid", "true")

    failReset = true
    await userEvent.type(input, "defgh")
    await userEvent.click(within(dialog).getByRole("button", { name: t.userReset }))
    await waitFor(() => expect(within(dialog).getByRole("alert")).toHaveTextContent(/.+/))
    expect(calls.find((c) => c.url.endsWith("/reset-password"))?.body).toEqual({ password: "abcdefgh" })

    failReset = false
    await userEvent.click(within(dialog).getByRole("button", { name: t.userReset }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(await screen.findByText(t.userPasswordResetDone)).toBeInTheDocument()
  })
})
