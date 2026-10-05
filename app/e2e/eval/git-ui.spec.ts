import { expect, test, type Page } from "@playwright/test"
import { login, PROJECT, SHOTS } from "./backlog-support"

/**
 * Git integration UI (no real GitLab token here): the ON/OFF switch in the
 * project settings, the sidebar entry that follows it, and the Git page.
 * Restores the integration state the project had before (other specs may rely on it).
 */
test.describe.configure({ mode: "serial" })

const BASE = `/projects/${PROJECT}`
const GIT_API = `/api/projects/${PROJECT}/git`
let initialEnabled = false
const gitLink = (page: Page) => page.locator(`aside a[href="${BASE}/git"]`)

async function setEnabled(page: Page, enabled: boolean) {
  const res = await page.request.put(GIT_API, { data: { enabled } })
  expect(res.ok()).toBe(true)
}

async function noHorizontalScroll(page: Page) {
  const { scroll, inner } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }))
  expect(scroll).toBeLessThanOrEqual(inner + 1)
}

test("switch in settings adds / removes the sidebar entry; Git page states", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await login(page, "po")
  initialEnabled = ((await (await page.request.get(GIT_API)).json()) as { enabled?: boolean }).enabled === true
  await setEnabled(page, false)

  await page.goto(BASE)
  await expect(page.locator("aside nav").first()).toBeVisible()
  await expect(gitLink(page)).toHaveCount(0)

  await page.goto(`${BASE}/settings#git`)
  const section = page.locator("#git")
  const toggle = section.getByRole("switch", { name: "Git 連携を使う" })
  await expect(toggle).not.toBeChecked()
  await section.scrollIntoViewIfNeeded()
  await section.screenshot({ path: `${SHOTS}/git-settings-off.png` })

  await toggle.click()
  await expect(toggle).toBeChecked()
  await expect(gitLink(page)).toHaveCount(1, { timeout: 30_000 })
  await expect(section.getByRole("switch", { name: "マージで自動完了" })).toBeVisible()
  await section.screenshot({ path: `${SHOTS}/git-settings-on.png` })

  await gitLink(page).click()
  await expect(page).toHaveURL(new RegExp(`${BASE}/git$`))
  await expect(page.getByRole("heading", { level: 1, name: "開発（Git）" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2, name: "リポジトリ" })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/git-page-on-1280.png`, fullPage: true })

  await page.setViewportSize({ width: 375, height: 800 })
  await page.reload()
  await expect(page.getByRole("heading", { level: 1, name: "開発（Git）" })).toBeVisible()
  await expect(page.getByRole("heading", { level: 2, name: "最近の動き" })).toBeVisible()
  await noHorizontalScroll(page)
  await page.screenshot({ path: `${SHOTS}/git-page-on-375.png`, fullPage: true })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(`${BASE}/settings#git`)
  const toggle2 = page.locator("#git").getByRole("switch", { name: "Git 連携を使う" })
  await toggle2.click()
  const dialog = page.getByRole("alertdialog").or(page.getByRole("dialog"))
  await dialog.getByRole("button", { name: "オフにする" }).click()
  await expect(toggle2).not.toBeChecked()
  await expect(gitLink(page)).toHaveCount(0, { timeout: 30_000 })

  await page.goto(`${BASE}/git`)
  await expect(page.getByRole("heading", { name: "Git 連携はオフになっています" })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/git-page-off.png` })
})

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage()
  await login(page, "po")
  await setEnabled(page, initialEnabled)
  await page.close()
})
