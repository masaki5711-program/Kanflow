import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CollaboraEditor } from "./collabora-editor"
import AiReportsPanel from "./ai-reports-panel"
import { jsonResponse, renderWithProviders } from "./__tests__/helpers"
import { getTranslations } from "@/lib/i18n"

const t = getTranslations("en")

let response: () => Response

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => response()))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("CollaboraEditor", () => {
  it("posts the access token to the editor iframe exactly once", async () => {
    const submit = vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(() => {})
    response = () => jsonResponse({ editorUrl: "https://office/edit", accessToken: "tok", accessTokenTtl: 99 })
    const onClose = vi.fn()
    const { container, rerender } = renderWithProviders(<CollaboraEditor projectId="p1" attachmentId="a1" onClose={onClose} />)
    expect(screen.getByText(t.editorLoading)).toHaveAttribute("role", "status")
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1))
    const form = container.querySelector("form")!
    expect(form).toHaveAttribute("action", "https://office/edit")
    expect(form).toHaveAttribute("target", "collabora-frame")
    expect((form.elements.namedItem("access_token") as HTMLInputElement).value).toBe("tok")
    expect((form.elements.namedItem("access_token_ttl") as HTMLInputElement).value).toBe("99")
    expect(screen.getByTitle(t.edit)).toHaveAttribute("name", "collabora-frame")
    rerender(<CollaboraEditor projectId="p1" attachmentId="a1" onClose={onClose} />)
    expect(submit).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole("button", { name: new RegExp(t.back) }))
    expect(onClose).toHaveBeenCalled()
  })

  it("shows the error with a download fallback when the server offers one", async () => {
    response = () => jsonResponse({ error: "Office offline", downloadUrl: "/files/a1", originalName: "spec.docx" }, 503)
    const onClose = vi.fn()
    renderWithProviders(<CollaboraEditor projectId="p1" attachmentId="a1" onClose={onClose} />)
    expect(await screen.findByText("Office offline")).toHaveAttribute("role", "alert")
    const link = screen.getByRole("link", { name: t.dashboardDownloadNamed.replace("{name}", "spec.docx") })
    expect(link).toHaveAttribute("href", "/files/a1?download")
    const backs = screen.getAllByRole("button", { name: new RegExp(t.back) })
    await userEvent.click(backs[backs.length - 1])
    expect(onClose).toHaveBeenCalled()
  })

  it("uses the generic message for an invalid config and has no fallback link", async () => {
    response = () => jsonResponse({ editorUrl: "x" })
    renderWithProviders(<CollaboraEditor projectId="p1" attachmentId="a1" onClose={() => {}} />)
    expect(await screen.findByText(t.editorError)).toBeInTheDocument()
    expect(screen.queryByRole("link")).not.toBeInTheDocument()
  })

  it("defaults the fallback file name", async () => {
    response = () => jsonResponse({ error: "x", downloadUrl: "/f" }, 500)
    renderWithProviders(<CollaboraEditor projectId="p1" attachmentId="a1" onClose={() => {}} />)
    expect(await screen.findByRole("link", { name: t.dashboardDownloadNamed.replace("{name}", "download") })).toBeInTheDocument()
  })
})

describe("AiReportsPanel (integration)", () => {
  const structured = JSON.stringify({ headline: "Structured headline", overview: "All good" })
  const REPORTS = [
    { id: "r2", trigger: "sprint_completed", status: "done", title: "Structured", summary: "sum", body: null, structured, createdAt: "2026-09-22T06:30:00Z" },
    { id: "r1", trigger: "custom", status: "done", title: "Markdown", summary: null, body: "## Heading\n\n- item", structured: null, createdAt: "2026-09-21T06:30:00Z" },
  ]

  it("renders nothing without reports (and on a non-array payload)", async () => {
    response = () => jsonResponse({ unexpected: true })
    renderWithProviders(<AiReportsPanel projectId="p1" />)
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled())
    expect(screen.queryByRole("heading", { name: t.aiReportsTitle })).not.toBeInTheDocument()
  })

  it("expands a structured report as a document and a legacy report as markdown", async () => {
    response = () => jsonResponse(REPORTS)
    renderWithProviders(<AiReportsPanel projectId="p1" />)
    const latest = await screen.findByRole("button", { name: /Structured/ })
    expect(screen.getByText("sum")).toBeInTheDocument()
    await userEvent.click(latest)
    expect(latest).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByText("Structured headline")).toBeInTheDocument()
    expect(screen.queryByText("sum")).not.toBeInTheDocument()
    await userEvent.click(latest)
    expect(latest).toHaveAttribute("aria-expanded", "false")

    await userEvent.click(screen.getByRole("button", { name: t.aiReportOlderShow.replace("{count}", "1") }))
    const legacy = screen.getByRole("button", { name: /Markdown/ })
    expect(legacy).toHaveTextContent("custom")
    await userEvent.click(legacy)
    expect(screen.getByRole("heading", { name: "Heading" })).toBeInTheDocument()
    expect(screen.getByText("item")).toBeInTheDocument()
  })

  it("shows an error toast when loading fails", async () => {
    response = () => jsonResponse({ error: "x" }, 500)
    renderWithProviders(<AiReportsPanel projectId="p1" />)
    expect(await screen.findByText(t.aiReportLoadFailed)).toBeInTheDocument()
  })
})
