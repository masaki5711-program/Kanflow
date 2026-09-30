/**
 * Platform eval (cycle 2): login error message + logout via the user menu (probe).
 * Wrong-password attempts use a non-existent e-mail so no shared account is throttled.
 */
import { test } from "@playwright/test"
import * as fs from "node:fs"
import { apiFor, apiLogin, BASE, DATA, PASSWORD, shot } from "./platform-helpers"

test.setTimeout(240_000)

test("login error message per language + logout", async ({ browser }) => {
  const log: string[] = []
  for (const lang of ["ja", "en", "id"]) {
    const ctx = await browser.newContext({ baseURL: BASE })
    const page = await ctx.newPage()
    await page.goto("/login")
    await page.locator(`button[lang=${lang}]`).click()
    await page.locator("input[type=email]").fill(`nobody-c2-${lang}@example.test`)
    await page.locator("input[type=password]").fill("wrong-password-123")
    const t0 = Date.now()
    const cb = page.waitForResponse((r) => r.url().includes("/api/auth/callback/credentials"), { timeout: 60_000 }).catch(() => null)
    await page.locator("form button[type=submit]").click()
    const r = await cb
    const ok = await page.locator("[role=alert]").first().waitFor({ timeout: 60_000 }).then(() => true).catch(() => false)
    log.push(`[${lang}] wrong login: callback ${r?.status()} alert=${ok} after ${Date.now() - t0} ms text="${(await page.locator("[role=alert]").allTextContents()).join(" | ")}" url=${page.url()}`)
    await page.screenshot({ path: shot(`login-error-${lang}`) })
    await ctx.close()
  }

  // logout via user menu (throwaway user re-activated, deactivated again)
  const [email, id] = fs.readFileSync(`${DATA}/c2-login-user.txt`, "utf8").trim().split(/\s+/)
  const admin = await apiFor("admin")
  await admin.patch(`/api/users/${id}`, { data: { isActive: true } })
  try {
    const api = await apiLogin(email, PASSWORD)
    const ctx = await browser.newContext({ baseURL: BASE, storageState: await api.storageState() })
    const page = await ctx.newPage()
    await page.goto("/")
    await page.waitForLoadState("networkidle").catch(() => {})
    const btns = await page.locator("header [data-header-end] button[aria-expanded]").evaluateAll((els) => els.map((e) => `${e.getAttribute("aria-label")}|${e.getAttribute("aria-expanded")}`))
    log.push(`header-end buttons: ${btns.join(" ; ")}`)
    await page.locator("header [data-header-end] button[aria-expanded]").last().click({ timeout: 10_000 })
    await page.waitForTimeout(500)
    const items = await page.getByRole("button").allTextContents()
    log.push(`buttons after opening user menu: ${items.map((s) => s.trim()).filter(Boolean).join(" ; ")}`)
    await page.screenshot({ path: shot("usermenu-open") })
    const logout = page.getByRole("button", { name: /Log out|Logout|Sign out|ログアウト|Keluar/i })
    log.push(`logout candidates: ${await logout.count()}`)
    await logout.first().click({ timeout: 10_000 })
    await page.waitForURL(/\/login/, { timeout: 30_000 }).catch(() => {})
    await page.waitForLoadState("networkidle").catch(() => {})
    log.push(`after logout url=${page.url()} html lang=${await page.locator("html").getAttribute("lang")} cookie=${(await ctx.cookies()).find((c) => c.name === "kanflow_lang")?.value}`)
    const me = await page.request.get("/api/user/language")
    log.push(`session after logout: /api/user/language -> ${me.status()}`)
    await page.screenshot({ path: shot("login-after-logout") })
    await ctx.close()
  } finally {
    await admin.patch(`/api/users/${id}`, { data: { isActive: false } })
    fs.writeFileSync(`${DATA}/c2-login-probe.log`, log.join("\n") + "\n")
  }
})
