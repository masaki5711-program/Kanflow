import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { getTranslations } from "@/lib/i18n"
import { LanguageProvider } from "@/lib/language-context"
import { SkipLink, findMainContent, focusMainContent, MAIN_CONTENT_ID } from "./skip-link"

const ja = getTranslations("ja")

describe("findMainContent / focusMainContent", () => {
  it("prefers #main-content, falls back to the first <main>, else null", () => {
    // Arrange
    document.body.innerHTML = `<main id="other">a</main><div id="${MAIN_CONTENT_ID}">b</div>`
    // Act + Assert
    expect(findMainContent(document)?.id).toBe(MAIN_CONTENT_ID)
    document.body.innerHTML = `<main id="only">a</main>`
    expect(findMainContent(document)?.id).toBe("only")
    document.body.innerHTML = `<div>none</div>`
    expect(findMainContent(document)).toBeNull()
    expect(focusMainContent(document)).toBe(false)
  })

  it("makes the target programmatically focusable and focuses it", () => {
    document.body.innerHTML = `<main>content</main>`
    expect(focusMainContent(document)).toBe(true)
    const main = document.querySelector("main")!
    expect(main).toHaveAttribute("tabindex", "-1")
    expect(document.activeElement).toBe(main)
  })

  it("keeps an existing tabindex", () => {
    document.body.innerHTML = `<main tabindex="0">content</main>`
    focusMainContent(document)
    expect(document.querySelector("main")).toHaveAttribute("tabindex", "0")
  })
})

describe("SkipLink", () => {
  it("is a localized link that moves focus to the page's main landmark", async () => {
    // Arrange
    document.body.innerHTML = ""
    render(
      <LanguageProvider initialLanguage="ja">
        <SkipLink />
        <main>page</main>
      </LanguageProvider>,
    )
    const link = screen.getByRole("link", { name: ja.skipToMain })
    expect(link).toHaveAttribute("href", `#${MAIN_CONTENT_ID}`)
    // Act
    await userEvent.click(link)
    // Assert
    expect(document.activeElement).toBe(screen.getByRole("main"))
  })
})
