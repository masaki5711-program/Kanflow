import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { APP_GENERATION, appVersion } from "@/lib/app-version"

const { VersionBadge } = await import("./version-badge")
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

describe("VersionBadge", () => {
  it("shows the generation, with the exact version as tooltip and accessible name (ja / en / id)", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_VERSION", "v2-prod-20261105")
    for (const [lang, word] of [["ja", "バージョン"], ["en", "Version"], ["id", "Versi"]] as const) {
      const { unmount } = render(
        <LanguageProvider initialLanguage={lang}>
          <VersionBadge />
        </LanguageProvider>,
      )
      const badge = screen.getByText(APP_GENERATION)
      expect(badge).toHaveAttribute("title", `${word} v2-prod-20261105`)
      expect(badge).toHaveAccessibleName(`${APP_GENERATION} — ${word} v2-prod-20261105`)
      expect(badge).toHaveAttribute("data-app-version", "v2-prod-20261105")
      unmount()
    }
  })
})
