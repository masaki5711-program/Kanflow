import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { APP_GENERATION, appVersion } from "@/lib/app-version"

const { AppVersionText, VersionBadge } = await import("./version-badge")
const { LanguageProvider } = await import("@/lib/language-context")

afterEach(() => vi.unstubAllEnvs())

describe("appVersion", () => {
  it("returns the stamped git tag", () => {
    expect(appVersion("v2-prod-20261105")).toBe("v2-prod-20261105")
    expect(appVersion("v2-prod-20261105-3-g1a2b3c4")).toBe("v2-prod-20261105-3-g1a2b3c4")
  })

  it("falls back to dev when missing, blank, too long or not a plain token", () => {
    expect(appVersion(undefined)).toBe("dev")
    expect(appVersion("  ")).toBe("dev")
    expect(appVersion("x".repeat(65))).toBe("dev")
    expect(appVersion("v2 <script>")).toBe("dev")
  })
})

const WORDS = [
  ["ja", "バージョン"],
  ["en", "Version"],
  ["id", "Versi"],
] as const

describe("VersionBadge", () => {
  it("shows the generation; the exact version is the tooltip and screen-reader text (ja / en / id)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "v2-prod-20261105")
    for (const [lang, word] of WORDS) {
      const { container, unmount } = render(
        <LanguageProvider initialLanguage={lang}>
          <VersionBadge />
        </LanguageProvider>,
      )
      const badge = container.querySelector("[data-app-version]") as HTMLElement
      expect(badge).toHaveAttribute("data-app-version", "v2-prod-20261105")
      expect(badge).toHaveAttribute("title", `${word} v2-prod-20261105`)
      expect(badge).not.toHaveAttribute("aria-label")
      expect(badge).toHaveTextContent(`${APP_GENERATION}, ${word} v2-prod-20261105`)
      expect(screen.getByText(`, ${word} v2-prod-20261105`)).toHaveClass("sr-only")
      unmount()
    }
  })
})

describe("AppVersionText", () => {
  it("shows the generation and the exact version as visible text (ja / en / id)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "v2-prod-20261105")
    for (const [lang, word] of WORDS) {
      const { unmount } = render(
        <LanguageProvider initialLanguage={lang}>
          <AppVersionText />
        </LanguageProvider>,
      )
      expect(screen.getByText(`${APP_GENERATION} · ${word} v2-prod-20261105`)).not.toHaveClass("sr-only")
      unmount()
    }
  })
})
