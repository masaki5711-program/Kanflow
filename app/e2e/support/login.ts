import { expect, type Page } from "@playwright/test"

/** Login-page strings per language (mirrors src/lib/i18n/auth.ts). */
export const LOGIN_TEXT = {
  ja: { language: "日本語", title: "ログイン", email: "メールアドレス", password: "パスワード", button: "ログイン" },
  en: { language: "English", title: "Login", email: "Email Address", password: "Password", button: "Login" },
  id: { language: "Bahasa Indonesia", title: "Masuk", email: "Alamat Email", password: "Kata Sandi", button: "Masuk" },
} as const

export type LoginLanguage = keyof typeof LOGIN_TEXT

/**
 * Strings of the language the login page actually rendered in. Since the cycle-1
 * login i18n fix the page follows the language cookie / Accept-Language (Playwright's
 * default locale is en-US), so do not assume ja.
 */
export async function renderedLoginText(page: Page) {
  const lang = (await page.locator("html").getAttribute("lang")) ?? "ja"
  return LOGIN_TEXT[(lang in LOGIN_TEXT ? lang : "ja") as LoginLanguage]
}

/** Sign in through the real login form (in whatever language the page rendered). */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login")
  const t = await renderedLoginText(page)
  await page.getByLabel(t.email).fill(email)
  await page.getByLabel(t.password).fill(password)
  await page.getByRole("button", { name: t.button, exact: true }).click()
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 60_000 })
}
