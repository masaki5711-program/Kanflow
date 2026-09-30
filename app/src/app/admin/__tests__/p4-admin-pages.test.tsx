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
vi.mock("../api-tokens/api-token-management", () => ({ ApiTokenManagement: () => <div>API TOKENS</div> }))
vi.mock("../metrics/metrics-dashboard", () => ({ MetricsDashboard: () => <div>METRICS</div> }))

const pages = {
  "API TOKENS": (await import("../api-tokens/page")).default,
  METRICS: (await import("../metrics/page")).default,
}

describe.each(Object.entries(pages))("admin %s page", (marker, Page) => {
  beforeEach(() => vi.clearAllMocks())

  it("redirects anonymous users to /login", async () => {
    m.auth.mockResolvedValue(null)
    await expect(Page()).rejects.toThrow("REDIRECT:/login")
  })

  it("redirects non-admins to /", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "section_manager" } })
    await expect(Page()).rejects.toThrow(/^REDIRECT:\/$/)
  })

  it("renders for admins on the wide layout", async () => {
    m.auth.mockResolvedValue({ user: { id: "u1", role: "admin" } })
    render(await Page())
    expect(screen.getByText(marker)).toBeInTheDocument()
    expect(screen.getByRole("main")).toHaveClass("page-wide")
  })
})
