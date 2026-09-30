import { afterEach, describe, expect, it, vi } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import MediaPreviewModal, { type MediaItem } from "./media-preview-modal"
import { AppProviders, stubLayout } from "./__tests__/helpers"
import { getTranslations } from "@/lib/i18n"

stubLayout()
const t = getTranslations("en")

const IMAGES: MediaItem[] = [
  { id: "a", originalName: "a.png", mimeType: "image/png" },
  { id: "v", originalName: "clip.mp4", mimeType: "video/mp4" },
  { id: "b", originalName: "b.jpg", mimeType: "image/jpeg", url: "/files/b?sig=1" },
]

function renderViewer(items: MediaItem[], startIndex = 0, projectId: string | undefined = "p1") {
  const onClose = vi.fn()
  const utils = render(
    <AppProviders>
      <MediaPreviewModal projectId={projectId} items={items} startIndex={startIndex} onClose={onClose} />
    </AppProviders>,
  )
  return { onClose, ...utils }
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("MediaPreviewModal", () => {
  it("shows an image with a download link and position counter", () => {
    renderViewer(IMAGES)
    expect(screen.getByRole("dialog", { name: "a.png" })).toHaveAttribute("aria-modal", "true")
    expect(screen.getByRole("img", { name: "a.png" })).toHaveAttribute("src", "/api/projects/p1/attachments/a")
    expect(screen.getByRole("link", { name: t.dashboardDownload })).toHaveAttribute(
      "href",
      "/api/projects/p1/attachments/a?download=1",
    )
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
  })

  it("navigates between images only (skipping videos) with buttons and arrow keys", async () => {
    renderViewer(IMAGES)
    await userEvent.click(screen.getByRole("button", { name: t.dashboardMediaNext }))
    expect(screen.getByRole("img", { name: "b.jpg" })).toHaveAttribute("src", "/files/b?sig=1")
    // explicit URL with a query string uses & for the download flag
    expect(screen.getByRole("link", { name: t.dashboardDownload })).toHaveAttribute("href", "/files/b?sig=1&download=1")
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByRole("img", { name: "a.png" })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: "ArrowLeft" })
    expect(screen.getByRole("img", { name: "b.jpg" })).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: t.dashboardMediaPrev }))
    expect(screen.getByRole("img", { name: "a.png" })).toBeInTheDocument()
  })

  it("renders video/audio/unknown types without navigation", () => {
    const { container, unmount } = renderViewer(IMAGES, 1)
    expect(container.ownerDocument.querySelector("video")).toHaveAttribute("src", "/api/projects/p1/attachments/v")
    expect(screen.queryByRole("button", { name: t.dashboardMediaNext })).not.toBeInTheDocument()
    fireEvent.keyDown(window, { key: "ArrowRight" })
    expect(screen.getByRole("dialog", { name: "clip.mp4" })).toBeInTheDocument()
    unmount()

    renderViewer([{ id: "s", originalName: "song.mp3", mimeType: "audio/mpeg" }])
    expect(document.querySelector("audio")).toBeInTheDocument()
  })

  it("shows a no-preview message for other files", () => {
    renderViewer([{ id: "d", originalName: "doc.pdf", mimeType: "application/pdf" }], 5)
    expect(screen.getByText(t.dashboardMediaNoPreview)).toBeInTheDocument()
  })

  it("closes with the close button and with Escape", async () => {
    const { onClose } = renderViewer(IMAGES)
    await userEvent.click(screen.getByRole("button", { name: t.close }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true))
    await userEvent.keyboard("{Escape}")
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it("locks body scroll while open", () => {
    const { unmount } = renderViewer(IMAGES)
    expect(document.body.style.overflow).toBe("hidden")
    unmount()
    expect(document.body.style.overflow).toBe("")
  })

  it("regression: hook order stays stable when the item disappears or has no URL", () => {
    // Previously hooks ran after an early `return null`, so switching between a
    // renderable and a non-renderable state crashed with a hook-order error.
    const err = vi.spyOn(console, "error").mockImplementation(() => {})
    const onClose = vi.fn()
    const { rerender } = render(
      <AppProviders>
        <MediaPreviewModal projectId="p1" items={IMAGES} startIndex={0} onClose={onClose} />
      </AppProviders>,
    )
    expect(() =>
      rerender(
        <AppProviders>
          <MediaPreviewModal items={[{ id: "x", originalName: "x.png", mimeType: "image/png" }]} startIndex={0} onClose={onClose} />
        </AppProviders>,
      ),
    ).not.toThrow()
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    expect(() =>
      rerender(
        <AppProviders>
          <MediaPreviewModal projectId="p1" items={IMAGES} startIndex={2} onClose={onClose} />
        </AppProviders>,
      ),
    ).not.toThrow()
    // index state is kept (startIndex is only the initial value)
    expect(screen.getByRole("img", { name: "a.png" })).toBeInTheDocument()
    expect(err).not.toHaveBeenCalledWith(expect.stringMatching(/change in the order of Hooks/), expect.anything())
  })

  it("renders nothing for an empty item list", () => {
    renderViewer([])
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("toggles fullscreen with F and toasts when the browser refuses", async () => {
    const request = vi.fn(() => Promise.reject(new Error("denied")))
    Object.defineProperty(HTMLElement.prototype, "requestFullscreen", { value: request, configurable: true })
    renderViewer(IMAGES)
    fireEvent.keyDown(window, { key: "f" })
    expect(request).toHaveBeenCalled()
    expect(await screen.findByText(t.dashboardMediaFullscreenFailed)).toBeInTheDocument()

    const exit = vi.fn(() => Promise.resolve())
    Object.defineProperty(document, "fullscreenElement", { value: document.body, configurable: true })
    Object.defineProperty(document, "exitFullscreen", { value: exit, configurable: true })
    await userEvent.click(screen.getByRole("button", { name: t.dashboardMediaFullscreen }))
    expect(exit).toHaveBeenCalled()
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true })
    delete (HTMLElement.prototype as { requestFullscreen?: unknown }).requestFullscreen
  })
})
