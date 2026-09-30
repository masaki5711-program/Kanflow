import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import { renderWithProviders, stubFetch, jsonResponse, tr } from "@/app/__tests__/test-utils"
import { HIGHLIGHT_ATTR } from "@/hooks/use-deep-link-highlight"
import { iceboxLists } from "./fixtures"

const nav = vi.hoisted(() => ({ search: "", replace: vi.fn() }))

vi.mock("next/navigation", () => ({
  useParams: () => ({ projectId: "p1" }),
  usePathname: () => "/projects/p1/icebox",
  useRouter: () => ({ push: vi.fn(), replace: nav.replace }),
  useSearchParams: () => new URLSearchParams(nav.search),
}))
vi.mock("@/components/media-preview-modal", () => ({ default: () => null }))
vi.mock("@/components/pbi-draft-picker-modal", () => ({ PbiDraftPickerModal: () => null }))

const { default: IceboxPage } = await import("../page")

const t = tr("ja")

beforeEach(() => {
  nav.search = ""
  nav.replace.mockReset()
  Element.prototype.scrollIntoView = vi.fn()
  stubFetch([{ match: "/api/projects/p1/icebox", method: "GET", respond: () => jsonResponse(iceboxLists()) }])
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("IceboxPage ?item= deep link", () => {
  it("scrolls to, focuses and highlights the item card, then drops the param", async () => {
    nav.search = "item=r1"
    renderWithProviders(<IceboxPage />)
    await waitFor(() => expect(document.getElementById("icebox-item-r1")).toHaveFocus())
    const card = document.getElementById("icebox-item-r1")!
    expect(card).toHaveAttribute(HIGHLIGHT_ATTR)
    expect(card).toHaveTextContent("Export CSV")
    expect(card.scrollIntoView).toHaveBeenCalled()
    expect(nav.replace).toHaveBeenCalledWith("/projects/p1/icebox", { scroll: false })
  })

  it("shows a toast for an unknown item and drops the param", async () => {
    nav.search = "item=deleted"
    renderWithProviders(<IceboxPage />)
    expect(await screen.findByText(t.iceboxDeepLinkNotFound)).toBeInTheDocument()
    expect(nav.replace).toHaveBeenCalledWith("/projects/p1/icebox", { scroll: false })
  })

  it("does nothing without the param", async () => {
    renderWithProviders(<IceboxPage />)
    await screen.findByText("Export CSV")
    expect(nav.replace).not.toHaveBeenCalled()
    expect(document.querySelector(`[${HIGHLIGHT_ATTR}]`)).toBeNull()
  })
})

describe("findIceboxItem", () => {
  it("finds an item in any status list", async () => {
    const { findIceboxItem, iceboxItemElementId } = await import("../use-icebox-deep-link")
    expect(findIceboxItem(iceboxLists(), "f1")?.request).toBe("Old idea")
    expect(findIceboxItem(iceboxLists(), "zz")).toBeUndefined()
    expect(findIceboxItem(null, "u1")).toBeUndefined()
    expect(iceboxItemElementId("u1")).toBe("icebox-item-u1")
  })
})
