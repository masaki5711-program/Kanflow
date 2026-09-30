import { expect, test, type Page } from "@playwright/test"
import { api, BACKLOG, gotoBacklog, login, PROJECT, report, SHOTS, stamp, watch } from "./backlog-support"

/** Cycle 2: redesigned header (search icon, bell, avatar user menu) + backlog layout at 1440 / 1280 / 768 / 375. */
test.describe.configure({ mode: "serial" })

const WIDTHS = [1440, 1280, 768, 375] as const

async function headerFacts(page: Page) {
  return page.evaluate(() => {
    const header = document.querySelector("header")!
    const vis = (el: Element) => {
      const r = (el as HTMLElement).getBoundingClientRect()
      const cs = getComputedStyle(el as HTMLElement)
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none"
    }
    const items = [...header.querySelectorAll("a,button")].filter(vis).map((el) => {
      const r = el.getBoundingClientRect()
      return `${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}[${Math.round(r.x)},${Math.round(r.width)}x${Math.round(r.height)}]`
    })
    const overflowing = [...header.querySelectorAll("a,button")].filter(vis).filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length
    return { items, overflowing, docScroll: document.documentElement.scrollWidth, inner: window.innerWidth }
  })
}

for (const w of WIDTHS) {
  test(`header + backlog at ${w}px (PO)`, async ({ page }) => {
    const issues = watch(page)
    await page.setViewportSize({ width: w, height: w < 500 ? 800 : 900 })
    await login(page, "po")
    await gotoBacklog(page)
    const facts = await headerFacts(page)
    console.log(`${w} header`, JSON.stringify(facts))
    expect(facts.overflowing).toBe(0)
    await page.screenshot({ path: `${SHOTS}/c2-backlog-${w}.png` })
    // search button
    const search = page.getByRole("banner").getByRole("button", { name: "検索" })
    await expect(search).toBeVisible()
    console.log(`${w} search button text: "${(await search.innerText()).trim()}" title=${await search.getAttribute("title")}`)
    await search.click()
    const pal = page.getByRole("dialog").first()
    await expect(pal).toBeVisible()
    const pb = await pal.boundingBox()
    console.log(`${w} palette box`, JSON.stringify(pb))
    await page.keyboard.press("Escape")
    await expect(pal).toBeHidden()
    console.log(`${w} focus after palette Esc:`, await page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
    // bell
    const bell = page.getByRole("banner").getByRole("button", { name: /^通知/ })
    await bell.click()
    const panel = page.getByRole("dialog", { name: "通知" })
    await expect(panel).toBeVisible()
    const bb = await panel.boundingBox()
    console.log(`${w} bell panel`, JSON.stringify(bb), "fits", !!bb && bb.x >= 0 && bb.x + bb.width <= w + 1)
    await page.screenshot({ path: `${SHOTS}/c2-bell-${w}.png` })
    await page.keyboard.press("Escape")
    await expect(panel).toBeHidden()
    console.log(`${w} focus after bell Esc:`, await page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
    // user menu
    const avatar = page.getByRole("banner").getByRole("button", { name: /ユーザーメニュー|メニュー: E2E PO|E2E PO/ })
    await expect(avatar).toBeVisible()
    console.log(`${w} avatar label`, await avatar.getAttribute("aria-label"))
    await avatar.click()
    await expect(avatar).toHaveAttribute("aria-expanded", "true")
    const menu = page.getByTestId("user-menu-panel")
    await expect(menu).toBeVisible()
    const mb = await menu.boundingBox()
    const menuItems = await menu.locator("a,button").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.textContent ?? "").trim()))
    console.log(`${w} user menu`, JSON.stringify(menuItems), "box", JSON.stringify(mb), "fits", !!mb && mb.x >= 0 && mb.x + mb.width <= w + 1)
    await page.screenshot({ path: `${SHOTS}/c2-usermenu-${w}.png` })
    expect(menuItems.some((t) => /ログアウト/.test(t))).toBe(true)
    // keyboard: Tab into the menu, Esc closes and returns focus
    await page.keyboard.press("Tab")
    console.log(`${w} Tab from avatar ->`, await page.evaluate(() => (document.activeElement?.textContent ?? "").trim().slice(0, 30)))
    await page.keyboard.press("Escape")
    await expect(menu).toBeHidden()
    console.log(`${w} focus after menu Esc:`, await page.evaluate(() => document.activeElement?.getAttribute("aria-label")))
    // drawer below lg
    const drawerBtn = page.getByRole("banner").getByRole("button", { name: /メニューを開く/ })
    console.log(`${w} drawer button visible`, await drawerBtn.isVisible().catch(() => false))
    // backlog layout
    const lay = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      h1: document.querySelector("h1")?.getBoundingClientRect().width,
      cardsOverflow: [...document.querySelectorAll("[data-dnd-row]")].filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1).length,
    }))
    console.log(`${w} backlog layout`, JSON.stringify(lay))
    await page.screenshot({ path: `${SHOTS}/c2-backlog-${w}-full.png`, fullPage: true })
    report(`c2-header-${w}`, issues)
  })
}

test("admin header at 1280 and 768 (crowded bar)", async ({ page }) => {
  const issues = watch(page)
  await login(page, "admin")
  for (const w of [1280, 768, 375]) {
    await page.setViewportSize({ width: w, height: 800 })
    await page.goto(BACKLOG)
    await page.waitForLoadState("networkidle")
    const facts = await headerFacts(page)
    console.log(`admin ${w} header`, JSON.stringify(facts))
    await page.screenshot({ path: `${SHOTS}/c2-admin-header-${w}.png` })
    await page.getByRole("banner").getByRole("button", { name: /E2E Admin|ユーザーメニュー/ }).click()
    const menu = page.getByTestId("user-menu-panel")
    const items = await menu.locator("a,button").evaluateAll((els) => els.filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => (e.textContent ?? "").trim()))
    const mb = await menu.boundingBox()
    console.log(`admin ${w} menu`, JSON.stringify(items), "box", JSON.stringify(mb), "viewport h", 800)
    await page.screenshot({ path: `${SHOTS}/c2-admin-usermenu-${w}.png` })
    await page.keyboard.press("Escape")
  }
  report("c2-admin-header", issues)
})

test("logout from the user menu", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 })
  await login(page, "sm")
  await page.goto(BACKLOG)
  await page.getByRole("banner").getByRole("button", { name: /E2E SM|ユーザーメニュー/ }).click()
  await page.getByTestId("user-menu-panel").getByRole("button", { name: "ログアウト" }).click()
  await expect(page).toHaveURL(/\/login/, { timeout: 30_000 })
  console.log("after logout", page.url(), "login heading lang", await page.getByRole("heading", { level: 2 }).innerText())
})

test("F-01 edit modal: clearing both title fields", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const tag = `E2E-C2EDITBLANK-${stamp()}`
  const r = await api(page, "POST", `/api/projects/${PROJECT}/backlog`, { initiative: tag, userStory: "E2E blank test", workloadScore: 1 })
  const pbi = (r.body.data ?? r.body) as { id: string; displayId: number }
  await page.goto(`${BACKLOG}?pbi=${pbi.displayId}`)
  const dlg = page.getByRole("dialog", { name: tag })
  await dlg.getByRole("button", { name: "編集" }).click()
  await dlg.getByRole("textbox", { name: "イニシアティブ" }).fill("")
  await dlg.getByRole("textbox", { name: "ユーザーストーリー" }).fill("")
  await page.waitForTimeout(300)
  const save = page.getByRole("dialog").last().getByRole("button", { name: "更新" })
  console.log("edit blank: 更新 disabled", await save.isDisabled(), "alerts", await page.getByRole("alert").allInnerTexts())
  if (await save.isEnabled()) {
    const resp = page.waitForResponse((x) => x.request().method() === "PATCH")
    await save.click()
    const res = await resp
    console.log("edit blank PATCH", res.status(), (await res.text()).slice(0, 160))
    await page.waitForTimeout(500)
    await page.screenshot({ path: `${SHOTS}/c2-edit-blank.png` })
  }
  await api(page, "DELETE", `/api/projects/${PROJECT}/backlog/${pbi.id}`)
  report("c2-edit-blank", issues)
})
