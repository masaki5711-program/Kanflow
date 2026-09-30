import { test } from "@playwright/test"
import { BACKLOG, login, report, SHOTS, watch } from "./backlog-support"

/** Cycle 2: admin user menu on a short phone viewport (375x600 / 667x375 landscape). */
for (const [w, h] of [[375, 600], [667, 375]] as const) {
  test(`admin user menu at ${w}x${h}`, async ({ page }) => {
    const issues = watch(page)
    await page.setViewportSize({ width: w, height: h })
    await login(page, "admin")
    await page.goto(BACKLOG)
    await page.waitForLoadState("networkidle")
    await page.getByRole("banner").getByRole("button", { name: /ユーザーメニュー/ }).click()
    const menu = page.getByTestId("user-menu-panel")
    const logout = menu.getByRole("button", { name: "ログアウト" })
    const mb = await menu.boundingBox()
    const lb = await logout.boundingBox()
    const scrollable = await menu.evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight, oy: getComputedStyle(el).overflowY }))
    console.log(`${w}x${h} menu box`, JSON.stringify(mb), "logout box", JSON.stringify(lb), "logout in viewport", !!lb && lb.y + lb.height <= h, JSON.stringify(scrollable))
    await page.screenshot({ path: `${SHOTS}/c2-admin-usermenu-${w}x${h}.png` })
    // Can the page scroll to reach it? (panel is position:fixed)
    await page.mouse.wheel(0, 600)
    await page.waitForTimeout(300)
    const lb2 = await logout.boundingBox()
    console.log(`${w}x${h} after wheel logout box`, JSON.stringify(lb2), "menu open", await menu.isVisible())
    report(`c2-short-${w}`, issues)
  })
}
