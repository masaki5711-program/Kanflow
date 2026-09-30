import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  params: new URLSearchParams(),
}))

vi.mock("next-auth/react", () => ({ signIn: mocks.signIn }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  useSearchParams: () => mocks.params,
}))

const { default: LoginPage } = await import("../page")
const ja = getTranslations("ja")
const en = getTranslations("en")
const id = getTranslations("id")

async function fillAndSubmit(t = ja) {
  const user = userEvent.setup()
  await user.type(screen.getByLabelText(t.loginEmail), "a@example.com")
  await user.type(screen.getByLabelText(t.loginPassword), "secret123")
  await user.click(screen.getByRole("button", { name: t.loginButton }))
  return user
}

describe("LoginPage", () => {
  beforeEach(() => {
    mocks.signIn.mockReset()
    mocks.push.mockReset()
    mocks.refresh.mockReset()
    mocks.params = new URLSearchParams()
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 204 })))
  })

  it("renders in Japanese by default and switches to English and Indonesian", async () => {
    const user = userEvent.setup()
    render(<LoginPage />)
    expect(screen.getByRole("heading", { name: ja.loginTitle })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /english/i }))
    expect(screen.getByRole("heading", { name: en.loginTitle })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: en.loginButton })).toBeInTheDocument()

    // accessible name starts with the visible text (WCAG 2.5.3)
    const idButton = screen.getByRole("button", { name: /^ID/ })
    expect(idButton).toHaveAccessibleName("ID — Bahasa Indonesia")
    await user.click(idButton)
    expect(idButton).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("heading", { name: id.loginTitle })).toBeInTheDocument()
    // <html lang> and the document title follow the chosen language
    expect(document.documentElement.lang).toBe("id")
    expect(document.title).toBe(`${id.loginTitle} · Kanflow`)
  })

  it("shows the idle-timeout notice from ?reason=idle until the user submits", async () => {
    mocks.params = new URLSearchParams("reason=idle")
    mocks.signIn.mockResolvedValue({ error: "CredentialsSignin" })
    render(<LoginPage />)
    expect(screen.getByRole("alert")).toHaveTextContent(ja.sessionTimedOut)

    await fillAndSubmit()
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(ja.loginError))
    expect(screen.getByLabelText(ja.loginEmail)).toHaveAttribute("aria-invalid", "true")
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it("saves the selected language and navigates home on success", async () => {
    mocks.signIn.mockResolvedValue({ ok: true })
    const user = userEvent.setup()
    render(<LoginPage />)
    await user.click(screen.getByRole("button", { name: /english/i }))
    await fillAndSubmit(en)

    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"))
    expect(mocks.signIn).toHaveBeenCalledWith("credentials", { email: "a@example.com", password: "secret123", redirect: false })
    const fetchMock = vi.mocked(fetch)
    expect(fetchMock).toHaveBeenCalledWith("/api/user/language", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ language: "en" }) }))
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it("still navigates when saving the language fails", async () => {
    mocks.signIn.mockResolvedValue({ ok: true })
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {})
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline") }))
    render(<LoginPage />)
    await fillAndSubmit()
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/"))
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it("shows a generic error when signIn throws", async () => {
    mocks.signIn.mockRejectedValue(new Error("boom"))
    render(<LoginPage />)
    await fillAndSubmit()
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(ja.error))
    expect(screen.getByRole("button", { name: ja.loginButton })).toBeEnabled()
  })
})
