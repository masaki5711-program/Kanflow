import { useEffect } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { act, render, screen } from "@testing-library/react"
import { LanguageProvider, useLanguage } from "./language-context"
import { getTranslations } from "./i18n"

let ctx: ReturnType<typeof useLanguage>
function capture(value: ReturnType<typeof useLanguage>) {
  ctx = value
}
function Probe() {
  const value = useLanguage()
  // Capture after commit (not during render) so the test can call the setters.
  useEffect(() => {
    capture(value)
  })
  return (
    <span data-testid="probe">
      {value.language}/{value.projectType}
    </span>
  )
}

const fetchMock = vi.fn(() => Promise.resolve(new Response("{}")))

beforeEach(() => {
  fetchMock.mockClear()
  vi.stubGlobal("fetch", fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("LanguageProvider", () => {
  it("provides Japanese defaults without a provider", () => {
    render(<Probe />)
    expect(screen.getByTestId("probe")).toHaveTextContent("ja/software")
    expect(ctx.t).toEqual(getTranslations("ja"))
    // default no-op setters do not throw
    ctx.setLanguage("en")
    ctx.setLanguageLocal("en")
    ctx.setProjectType("general")
  })

  it("exposes the initial language and project type with matching translations", () => {
    render(
      <LanguageProvider initialLanguage="id" initialProjectType="general">
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByTestId("probe")).toHaveTextContent("id/general")
    expect(ctx.t).toEqual(getTranslations("id"))
  })

  it("setLanguage does not persist when persistToUser is false", () => {
    render(
      <LanguageProvider>
        <Probe />
      </LanguageProvider>,
    )
    act(() => ctx.setLanguage("en"))
    expect(screen.getByTestId("probe")).toHaveTextContent("en/software")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("setLanguage PATCHes the user language when persistToUser is enabled", () => {
    render(
      <LanguageProvider persistToUser>
        <Probe />
      </LanguageProvider>,
    )
    act(() => ctx.setLanguage("id"))
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/language",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ language: "id" }) }),
    )
  })

  it("swallows persistence failures", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline")))
    render(
      <LanguageProvider persistToUser>
        <Probe />
      </LanguageProvider>,
    )
    await act(async () => ctx.setLanguage("en"))
    expect(ctx.language).toBe("en")
  })

  it("setLanguageLocal and setProjectType change state without saving", () => {
    render(
      <LanguageProvider persistToUser>
        <Probe />
      </LanguageProvider>,
    )
    act(() => {
      ctx.setLanguageLocal("en")
      ctx.setProjectType("process_improvement")
    })
    expect(screen.getByTestId("probe")).toHaveTextContent("en/process_improvement")
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("follows changes to the initial props", () => {
    const { rerender } = render(
      <LanguageProvider initialLanguage="ja">
        <Probe />
      </LanguageProvider>,
    )
    rerender(
      <LanguageProvider initialLanguage="en" initialProjectType="general">
        <Probe />
      </LanguageProvider>,
    )
    expect(screen.getByTestId("probe")).toHaveTextContent("en/general")
  })

  it("keeps <html lang> in sync with the active language", () => {
    document.documentElement.lang = "ja"
    const { rerender } = render(
      <LanguageProvider initialLanguage="id">
        <Probe />
      </LanguageProvider>,
    )
    expect(document.documentElement.lang).toBe("id")
    act(() => ctx.setLanguageLocal("en"))
    expect(document.documentElement.lang).toBe("en")
    rerender(
      <LanguageProvider initialLanguage="ja">
        <Probe />
      </LanguageProvider>,
    )
    expect(document.documentElement.lang).toBe("ja")
  })
})
