import { beforeEach, describe, expect, it, vi } from "vitest"
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
vi.mock("../categories/admin-category-management", () => ({ AdminCategoryManagement: () => <div>CATEGORIES</div> }))
vi.mock("../glossary/glossary-management", () => ({ GlossaryManagement: () => <div>GLOSSARY</div> }))
vi.mock("../sections/section-management", () => ({ SectionManagement: () => <div>SECTIONS</div> }))
vi.mock("../translations/translation-queue-panel", () => ({ TranslationQueuePanel: () => <div>TRANSLATIONS</div> }))
vi.mock("../users/user-management", () => ({ UserManagement: () => <div>USERS</div> }))

const pages = {
  CATEGORIES: (await import("../categories/page")).default,
  GLOSSARY: (await import("../glossary/page")).default,
  SECTIONS: (await import("../sections/page")).default,
  TRANSLATIONS: (await import("../translations/page")).default,
  USERS: (await import("../users/page")).default,
}

describe.each(Object.entries(pages))("admin %s page", (marker, Page) => {
  beforeEach(() => vi.clearAllMocks())

  it("redirects anonymous users to /login", async () => {
    m.auth.mockResolvedValue(null)
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
  })

  it("redirects non-admins to /", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "member" } })
    await expect(Page()).rejects.toThrow(/^REDIRECT:\/$/)
  })

  it("renders the management screen for admins", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })
    render(await Page())
    expect(screen.getByText("HEADER")).toBeInTheDocument()
    expect(screen.getByText(marker)).toBeInTheDocument()
    expect(m.redirect).not.toHaveBeenCalled()
  })
})
