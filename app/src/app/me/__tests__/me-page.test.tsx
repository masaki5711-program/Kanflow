import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

const m = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`)
  }),
}))

vi.mock("@/lib/auth", () => ({ auth: m.auth }))
vi.mock("next/navigation", () => ({ redirect: m.redirect }))
vi.mock("@/components/header", () => ({ Header: () => <header>HEADER</header> }))
vi.mock("../my-profile", () => ({ MyProfile: () => <div>PROFILE</div> }))
vi.mock("@/components/notifications/notification-settings", () => ({ NotificationSettings: () => <div>NOTIFICATION SETTINGS</div> }))
vi.mock("../api-tokens-section", () => ({ ApiTokensSection: () => <div>API TOKENS</div> }))

const { default: MyProfilePage } = await import("../page")

describe("MyProfilePage (server)", () => {
  it("redirects anonymous users to /login", async () => {
    m.auth.mockResolvedValue({ user: {} })
    await expect(MyProfilePage()).rejects.toThrow("REDIRECT:/login")
  })

  it("renders the profile for signed-in users of any role", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "member" } })
    render(await MyProfilePage())
    expect(screen.getByText("PROFILE")).toBeInTheDocument()
    expect(screen.getByText("NOTIFICATION SETTINGS")).toBeInTheDocument()
    expect(screen.getByText("API TOKENS")).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("page-narrow")
  })
})
