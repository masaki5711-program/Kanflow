import { expect, type Page } from "@playwright/test"

/** Login-page strings per language (mirrors src/lib/i18n/auth.ts). */
export const LOGIN_TEXT = {
  ja: { language: "日本語", title: "ログイン", email: "メールアドレス", password: "パスワード", button: "ログイン" },
  en: { language: "English", title: "Login", email: "Email Address", password: "Password", button: "Login" },
  id: { language: "Bahasa Indonesia", title: "Masuk", email: "Alamat Email", password: "Kata Sandi", button: "Masuk" },
} as const

export type LoginLanguage = keyof typeof LOGIN_TEXT

/** Sign in through the real login form (default language ja). */
export async function loginViaUi(page: Page, email: string, password: string): Promise<void> {
  const t = LOGIN_TEXT.ja
  await page.goto("/login")
  await page.getByLabel(t.email).fill(email)
  await page.getByLabel(t.password).fill(password)
  await page.getByRole("button", { name: t.button, exact: true }).click()
  await expect(page).not.toHaveURL(/\/login(\?|$)/, { timeout: 60_000 })
}
