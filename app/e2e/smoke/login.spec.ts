import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { LOGIN_TEXT, type LoginLanguage } from "../support/login"

// Read-only: renders the login page and switches the (client-side) language
// toggle. Never submits the form.

const LANGUAGES: LoginLanguage[] = ["ja", "en", "id"]

for (const lang of LANGUAGES) {
  test(`login page renders in ${lang}`, async ({ page }) => {
    const t = LOGIN_TEXT[lang]
    await page.goto("/login")

    // Accessible name is "<CODE> — <language name>" (WCAG 2.5.3: starts with the visible text).
    const toggle = page.getByRole("button", { name: `${lang.toUpperCase()} — ${t.language}`, exact: true })
    await toggle.click()
    await expect(toggle).toHaveAttribute("aria-pressed", "true")

    await expect(page.getByRole("heading", { level: 2, name: t.title })).toBeVisible()
    await expect(page.getByLabel(t.email)).toBeVisible()
    await expect(page.getByLabel(t.password)).toBeVisible()
    await expect(page.getByRole("button", { name: t.button, exact: true })).toBeEnabled()
  })
}

test("login page has no serious or critical axe violations", async ({ page }) => {
  await page.goto("/login")
  await expect(page.getByRole("heading", { level: 1, name: "Kanflow" })).toBeVisible()

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze()

  const blocking = results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.map((n) => n.target.join(" ")) }))
  expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
})

test("login form fields are reachable by keyboard", async ({ page }) => {
  await page.goto("/login")
  const email = page.getByLabel(LOGIN_TEXT.ja.email)
  await email.focus()
  await expect(email).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByLabel(LOGIN_TEXT.ja.password)).toBeFocused()
  await page.keyboard.press("Tab")
  await expect(page.getByRole("button", { name: LOGIN_TEXT.ja.button, exact: true })).toBeFocused()
})
