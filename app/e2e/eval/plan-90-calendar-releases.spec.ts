import { expect, test } from "@playwright/test"
import { PROJECT, SHOTS, report, stamp, userPage } from "./plan-support"

/** Calendar (events, sprint bars → ?sprint=, keyboard) and releases sanity. */

test("calendar: create event, sprint bar link, keyboard navigation", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto(`/projects/${PROJECT}/calendar`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/90-calendar-month.png`, fullPage: true })

  // Create an event on Oct 2 via the day button
  const s = stamp()
  const title = `E2E-C${s} イベント`
  await page.getByRole("button", { name: "次へ" }).click()
  await page.waitForTimeout(500)
  const dayBtn = page.getByRole("button", { name: /2026年10月2日.*にイベントを追加/ })
  console.log("day buttons matching 10/2:", await dayBtn.count())
  await dayBtn.first().click()
  const d = page.getByRole("dialog")
  await expect(d).toBeVisible()
  await d.getByLabel(/タイトル/).fill(title)
  await page.screenshot({ path: `${SHOTS}/91-calendar-event-modal.png` })
  await d.getByRole("button", { name: /保存|追加|作成/ }).last().click()
  await expect(page.getByRole("button", { name: title })).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/92-calendar-event-created.png`, fullPage: true })
  // Delete it
  await page.getByRole("button", { name: title }).click()
  await page.getByRole("dialog").getByRole("button", { name: "削除" }).click()
  await page.getByRole("button", { name: "OK", exact: true }).click()
  await expect(page.getByRole("button", { name: title })).toHaveCount(0)

  // F-17: the month grid is one Tab stop; arrows / Home / End / PageDown move the focused day
  const grid = page.getByRole("grid", { name: /2026年10月/ })
  await expect(grid).toBeVisible()
  expect(await grid.locator("[data-cal-day][tabindex='0']").count()).toBe(1)
  const first = page.getByRole("button", { name: /2026年10月1日.*にイベントを追加/ }).first()
  await first.focus()
  await page.keyboard.press("ArrowRight")
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /2026年10月2日/)
  await page.keyboard.press("ArrowDown")
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /2026年10月9日/)
  await page.keyboard.press("End")
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /2026年10月10日/)
  await page.keyboard.press("PageDown")
  await expect(page.getByRole("grid", { name: /2026年11月/ })).toBeVisible()
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /2026年11月10日/)
  await page.keyboard.press("PageUp")
  await expect(page.locator(":focus")).toHaveAttribute("aria-label", /2026年10月10日/)
  const focusVisible = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement
    const cs = getComputedStyle(el)
    return { outline: cs.outlineStyle + " " + cs.outlineWidth, boxShadow: cs.boxShadow }
  })
  console.log("focus style on day button:", JSON.stringify(focusVisible))
  await page.screenshot({ path: `${SHOTS}/93-calendar-keyboard-focus.png` })

  // Sprint bars → sprints?sprint=
  await page.getByRole("button", { name: "前へ" }).click()
  await page.getByRole("button", { name: "前へ" }).click()
  await page.waitForTimeout(800)
  const bars = page.getByRole("button", { name: /（進捗 \d+%）/ })
  const n = await bars.count()
  console.log("sprint bar buttons in Aug:", n)
  // one focusable button per sprint bar (not one per day)
  const names = await bars.evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))
  expect(new Set(names).size).toBe(names.length)
  if (n > 0) {
    await bars.first().click()
    await expect(page).toHaveURL(/\/sprints\?sprint=/)
    console.log("navigated to", page.url())
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${SHOTS}/94-sprint-from-calendar.png` })
  }
  report("calendar", issues)
  await ctx.close()
})

test("releases page sanity", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto(`/projects/${PROJECT}/releases`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/95-releases.png`, fullPage: true })
  const buttons = await page.getByRole("button").allInnerTexts()
  console.log("release page buttons:", JSON.stringify(buttons.filter(Boolean).slice(0, 20)))
  report("releases", issues)
  await ctx.close()
})

test("calendar + plan on 375px", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true })
  await page.goto(`/projects/${PROJECT}/calendar`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${SHOTS}/96-calendar-375.png`, fullPage: true })
  report("calendar 375", issues)
  await ctx.close()
})
