import { afterEach, describe, expect, it, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { LanguageProvider, useLanguage } from "@/lib/language-context"
import { getTranslations } from "@/lib/i18n"
import { LanguageButtons, LanguageMenu } from "./language-switcher"

function CurrentLanguage() {
  const { language } = useLanguage()
  return <output aria-label="current">{language}</output>
}

function renderWith(ui: React.ReactNode, persistToUser = true) {
  return render(
    <LanguageProvider initialLanguage="ja" persistToUser={persistToUser}>
      {ui}
      <CurrentLanguage />
    </LanguageProvider>,
  )
}

afterEach(() => vi.unstubAllGlobals())

describe("LanguageMenu", () => {
  it("is a labelled select that switches and persists the user language", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const user = userEvent.setup()
    renderWith(<LanguageMenu />)

    const select = screen.getByRole("combobox", { name: getTranslations("ja").navLanguageMenu })
    expect(select).toHaveValue("ja")
    expect(within(select).getAllByRole("option").map((o) => o.getAttribute("value"))).toEqual(["ja", "en", "id"])

    await user.selectOptions(select, "id")
    expect(screen.getByLabelText("current")).toHaveTextContent("id")
    // Label follows the new language.
    expect(screen.getByRole("combobox", { name: getTranslations("id").navLanguageMenu })).toHaveValue("id")
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/user/language",
      expect.objectContaining({ method: "PATCH", body: JSON.stringify({ language: "id" }) }),
    )
  })
})

describe("LanguageButtons", () => {
  it("marks the active language and switches on click", async () => {
    const user = userEvent.setup()
    renderWith(<LanguageButtons label="lang" />, false)
    const buttons = within(screen.getByRole("group", { name: "lang" })).getAllByRole("button")
    expect(buttons.map((b) => b.getAttribute("aria-pressed"))).toEqual(["true", "false", "false"])
    await user.click(buttons[1])
    expect(screen.getByLabelText("current")).toHaveTextContent("en")
    expect(buttons[1]).toHaveAttribute("aria-pressed", "true")
  })
})
