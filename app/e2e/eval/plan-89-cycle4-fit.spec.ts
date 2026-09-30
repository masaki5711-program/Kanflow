import { expect, test, type Page } from "@playwright/test"
import { SHOTS, getPlan, gotoPlan, userPage } from "./plan-support"

/**
 * Cycle 4 fixes:
 * - A3-09: the first view never opens on an empty timeline — when the usual
 *   anchor window has no bar, the plan zooms / scrolls to show every live item
 *   and today ("全体表示"); the toolbar button 「全体を表示」 does the same any time.
 * - A4-06: at ≥ 1280 px the default name column is sized to the longest name
 *   (clamped to 200–360 px); a splitter value overrides it and persists.
 */

/** Project whose unfinished plan items all ended months before today (admin can open any project). */
const ALL_OVERDUE = "cmoawajnf00058c9lvfcoi2jv"

async function timeline(page: Page) {
  return page.evaluate(() => {
    const c = document.querySelector("[data-plan-chart]") as HTMLElement
    const cr = c.getBoundingClientRect()
    const gridW = (c.querySelector('[role="row"] > div') as HTMLElement).getBoundingClientRect().width
    const visLeft = cr.left + gridW
    const bars = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-bar]")).map((b) => {
      const r = b.getBoundingClientRect()
      return { id: b.dataset.planBar!, inView: r.right > visLeft && r.left < cr.right, whole: r.left >= visLeft - 1 && r.right <= cr.right + 1 }
    })
    const today = document.querySelector("[data-plan-today-label]")?.getBoundingClientRect()
    const nameHeader = (c.querySelector("[role=columnheader]") as HTMLElement).getBoundingClientRect().width
    const names = Array.from(document.querySelectorAll<HTMLElement>("[data-plan-name]")).map((e) => ({ t: e.textContent ?? "", cut: e.scrollWidth > e.clientWidth + 1 }))
    return {
      bars,
      todayVisible: !!today && today.width > 0 && today.left >= visLeft - 2 && today.right <= cr.right + 2,
      nameHeader: Math.round(nameHeader),
      names,
    }
  })
}

const zoomOf = (page: Page) => new URL(page.url()).searchParams.get("zoom")
const pressedZoom = (page: Page) => page.locator('[role="group"] button[aria-pressed="true"]').textContent()

test("A3-09: an all-overdue plan opens zoomed out with every bar and today in view", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "admin", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page, "", ALL_OVERDUE)
  await expect(page.locator("[data-plan-bar]").first()).toBeAttached()
  await expect.poll(() => zoomOf(page)).not.toBeNull()
  await page.waitForTimeout(400)
  const l = await timeline(page)
  console.log("all-overdue first view", zoomOf(page), await pressedZoom(page), JSON.stringify(l.bars))
  await page.screenshot({ path: `${SHOTS}/c4-A3-09-first-view-1440.png` })
  expect(l.bars.length).toBeGreaterThan(0)
  expect(l.bars.every((b) => b.inView), "every bar on screen").toBe(true)
  expect(l.todayVisible, "today on screen").toBe(true)
  await expect(page.locator('[data-plan-offscreen="before"]')).toHaveCount(0)
  await ctx.close()
})

test("A3-09: the pilot opens with bars in view; 「全体を表示」 shows every live item and today", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  await expect(page.locator("[data-plan-bar]").first()).toBeAttached()
  await page.waitForTimeout(500)
  const first = await timeline(page)
  expect(first.bars.some((b) => b.inView), "first view shows a bar").toBe(true)

  // Scroll far away, then fit.
  await page.locator("[data-plan-chart]").evaluate((c) => { c.scrollLeft = c.scrollWidth })
  await page.getByRole("button", { name: "全体を表示" }).click()
  await page.waitForTimeout(500)
  const plan = await getPlan(page)
  const live = new Set(plan.items.filter((i) => i.status !== "done" && i.status !== "on_hold" && i.scheduleState !== "done").map((i) => i.id))
  const fit = await timeline(page)
  console.log("after fit", zoomOf(page), await pressedZoom(page), JSON.stringify(fit.bars))
  await page.screenshot({ path: `${SHOTS}/c4-A3-09-fit-1440.png` })
  for (const b of fit.bars.filter((x) => live.has(x.id))) expect(b.inView, `live bar ${b.id} in view`).toBe(true)
  expect(fit.todayVisible).toBe(true)
  // 今日へ still works afterwards (today pill / jump kept).
  await page.getByRole("button", { name: "今日へ" }).click()
  expect((await timeline(page)).todayVisible).toBe(true)
  await ctx.close()
})

test("A4-06: the name column fits the longest name at 1440 (200–360 px); the splitter overrides it", async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("kanflow:plan:")).forEach((k) => localStorage.removeItem(k)))
  await page.reload()
  await expect(page.locator("[data-plan-bar]").first()).toBeAttached()
  const l = await timeline(page)
  console.log("name column", l.nameHeader, JSON.stringify(l.names))
  await page.screenshot({ path: `${SHOTS}/c4-A4-06-names-1440.png` })
  expect(l.nameHeader).toBeGreaterThanOrEqual(200)
  expect(l.nameHeader).toBeLessThanOrEqual(360)
  // Below the upper clamp every name is shown in full.
  if (l.nameHeader < 358) expect(l.names.filter((n) => n.cut).map((n) => n.t)).toEqual([])
  else expect(l.names.filter((n) => !n.cut).length).toBeGreaterThan(0)

  const splitter = page.getByRole("separator", { name: "表の幅" })
  const w0 = Number(await splitter.getAttribute("aria-valuenow"))
  await splitter.focus()
  await page.keyboard.press("ArrowLeft")
  await expect(splitter).toHaveAttribute("aria-valuenow", String(w0 - 16))
  await page.reload()
  await expect(page.getByRole("separator", { name: "表の幅" })).toHaveAttribute("aria-valuenow", String(w0 - 16))
  await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("kanflow:plan:")).forEach((k) => localStorage.removeItem(k)))
  await ctx.close()
})
