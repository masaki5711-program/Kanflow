import { afterEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { jsonResponse, renderWithProviders, stubFetch, tr } from "@/app/__tests__/test-utils"
import { MyProfile } from "../my-profile"
import type { ProfileData } from "../profile-form"

const profile: ProfileData = {
  id: "u1",
  name: "Taro",
  email: "taro@example.com",
  employeeNumber: null,
  department: "QA",
  role: "member",
  language: "ja",
}

afterEach(() => vi.unstubAllGlobals())

function profileForm(t = tr("ja")) {
  return screen.getByRole("form", { name: t.myProfileTitle })
}

describe("MyProfile", () => {
  it("shows a skeleton while loading, then the profile", async () => {
    let resolve: (r: Response) => void = () => {}
    stubFetch([{ match: "/api/user/profile", method: "GET", respond: () => new Promise<Response>((r) => (resolve = r)) }])
    const t = tr("ja")
    renderWithProviders(<MyProfile />)
    expect(screen.getByText(t.loading)).toBeInTheDocument()
    resolve(jsonResponse(profile))
    expect(await screen.findByText("taro@example.com")).toBeInTheDocument()
    expect(screen.getByText(t.userRoleMember)).toBeInTheDocument()
  })

  it.each([
    ["admin", "userRoleAdmin"],
    ["section_manager", "roleSectionManager"],
  ] as const)("labels the %s role (en)", async (role, key) => {
    stubFetch([{ match: "/api/user/profile", respond: () => jsonResponse({ ...profile, role }) }])
    renderWithProviders(<MyProfile />, { language: "en" })
    expect(await screen.findByText(tr("en")[key])).toBeInTheDocument()
  })

  it("switches the display language from the language section", async () => {
    stubFetch([{ match: "/api/user/profile", respond: () => jsonResponse(profile) }])
    const user = userEvent.setup()
    renderWithProviders(<MyProfile />)
    const group = await screen.findByRole("group", { name: tr("ja").myProfileLanguageSection })
    const [ja, en] = within(group).getAllByRole("button")
    expect(ja).toHaveAttribute("aria-pressed", "true")
    await user.click(en)
    expect(await screen.findByRole("heading", { name: tr("en").myProfileLanguageSection })).toBeInTheDocument()
    expect(within(screen.getByRole("group", { name: tr("en").myProfileLanguageSection })).getAllByRole("button")[1])
      .toHaveAttribute("aria-pressed", "true")
  })

  it("keeps the skeleton and toasts when loading fails", async () => {
    stubFetch([{ match: "/api/user/profile", respond: () => jsonResponse({ error: "down" }, 500) }])
    renderWithProviders(<MyProfile />)
    expect(await screen.findByText("down")).toBeInTheDocument()
    expect(screen.getByText(tr("ja").loading)).toBeInTheDocument()
  })
})

describe("ProfileForm", () => {
  it("disables save until the form is dirty, then saves trimmed values", async () => {
    const fetchMock = stubFetch([
      { match: "/api/user/profile", method: "GET", respond: () => jsonResponse(profile) },
      {
        match: "/api/user/profile",
        method: "PATCH",
        respond: (_u, init) => jsonResponse({ ...profile, ...JSON.parse(String(init?.body)) }),
      },
    ])
    const user = userEvent.setup()
    const t = tr("ja")
    renderWithProviders(<MyProfile />)
    await screen.findByText("taro@example.com")
    const form = profileForm()
    const save = within(form).getByRole("button", { name: t.save })
    expect(save).toBeDisabled()

    const name = within(form).getByRole("textbox", { name: new RegExp(t.userName) })
    await user.clear(name)
    expect(save).toBeDisabled() // empty name
    await user.type(name, " Jiro ")
    await user.clear(within(form).getByRole("textbox", { name: t.myProfileDepartment }))
    await user.type(within(form).getByRole("textbox", { name: t.myProfileEmployeeNumber }), "E1")
    expect(save).toBeEnabled()

    const unload = new Event("beforeunload", { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    await user.click(save)
    expect(await screen.findByText(t.myProfileSaved)).toBeInTheDocument()
    const patch = fetchMock.mock.calls.find((c) => c[1]?.method === "PATCH")
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ name: "Jiro", employeeNumber: "E1", department: null })
    await waitFor(() => expect(save).toBeDisabled())
    expect(within(form).getByRole("textbox", { name: new RegExp(t.userName) })).toHaveValue("Jiro")
  })

  it("shows the server error inline when saving fails", async () => {
    stubFetch([
      { match: "/api/user/profile", method: "GET", respond: () => jsonResponse(profile) },
      { match: "/api/user/profile", method: "PATCH", respond: () => jsonResponse({ error: "name taken" }, 400) },
    ])
    const user = userEvent.setup()
    const t = tr("ja")
    renderWithProviders(<MyProfile />)
    await screen.findByText("taro@example.com")
    const form = profileForm()
    await user.type(within(form).getByRole("textbox", { name: new RegExp(t.userName) }), "X")
    await user.click(within(form).getByRole("button", { name: t.save }))
    expect(await within(form).findByText("name taken")).toBeInTheDocument()
  })
})

describe("PasswordForm", () => {
  async function setup(passwordResponse: () => Response) {
    const fetchMock = stubFetch([
      { match: "/api/user/profile", respond: () => jsonResponse(profile) },
      { match: "/api/user/password", method: "POST", respond: passwordResponse },
    ])
    const user = userEvent.setup()
    const t = tr("ja")
    renderWithProviders(<MyProfile />)
    await screen.findByText("taro@example.com")
    const form = screen.getByRole("form", { name: t.myProfilePasswordSection })
    const fill = async (current: string, next: string, confirm: string) => {
      const [cur, nxt, conf] = form.querySelectorAll<HTMLInputElement>("input[type=password]")
      await user.clear(cur)
      await user.clear(nxt)
      await user.clear(conf)
      if (current) await user.type(cur, current)
      if (next) await user.type(nxt, next)
      if (confirm) await user.type(conf, confirm)
    }
    return { fetchMock, user, t, form, fill }
  }

  it("rejects mismatched and too-short passwords without calling the API", async () => {
    const { fetchMock, user, t, form, fill } = await setup(() => jsonResponse({ ok: true }))
    const save = within(form).getByRole("button", { name: t.save })
    expect(save).toBeDisabled()
    await fill("oldpass", "abcdef", "abcdeg")
    await user.click(save)
    expect(within(form).getByText(t.myProfilePasswordMismatch)).toBeInTheDocument()
    await fill("oldpass", "abc", "abc")
    // bypass native minLength validation by submitting the form directly
    form.querySelectorAll("input").forEach((i) => i.removeAttribute("minlength"))
    await user.click(save)
    expect(within(form).getByText(t.userPasswordMinError)).toBeInTheDocument()
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("password"))).toBe(false)
  })

  it("changes the password, clears the form and toasts", async () => {
    const { fetchMock, user, t, form, fill } = await setup(() => jsonResponse({ ok: true }))
    await fill("oldpass", "newpass1", "newpass1")
    await user.click(within(form).getByRole("button", { name: t.save }))
    expect(await screen.findByText(t.myProfilePasswordChanged)).toBeInTheDocument()
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes("password"))
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ currentPassword: "oldpass", newPassword: "newpass1" })
    form.querySelectorAll<HTMLInputElement>("input").forEach((i) => expect(i).toHaveValue(""))
  })

  it("maps 401 to the wrong-password message and shows other server errors", async () => {
    let status = 401
    const { user, t, form, fill } = await setup(() => jsonResponse({ error: "boom" }, status))
    await fill("bad", "newpass1", "newpass1")
    await user.click(within(form).getByRole("button", { name: t.save }))
    expect(await within(form).findByText(t.myProfilePasswordWrong)).toBeInTheDocument()

    status = 500
    await user.click(within(form).getByRole("button", { name: t.save }))
    expect(await within(form).findByText("boom")).toBeInTheDocument()
  })
})
