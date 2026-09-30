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
vi.mock("../categories/category-settings", () => ({ CategorySettings: () => <div>SETTINGS</div> }))

const { default: CategoriesPage } = await import("../categories/page")

describe("CategoriesPage (server)", () => {
  it("redirects anonymous users to /login", async () => {
    m.auth.mockResolvedValue(null)
    await expect(CategoriesPage()).rejects.toThrow("REDIRECT:/login")
  })

  it("renders category settings for signed-in users", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1" } })
    render(await CategoriesPage())
    expect(screen.getByText("SETTINGS")).toBeInTheDocument()
  })
})
