import { expect, test, type Page } from "@playwright/test"
import { SHOTS, bar, createItem, deleteItem, getPlan, gotoPlan, report, stamp, userPage, type Item } from "./plan-support"

/** Bar drag / resize (mouse, keyboard, touch) at day zoom (32 px/day). */

const DW = 32
let parent: Item
let leaf: Item
let leaf2: Item
let ms: Item

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  const s = stamp()
  parent = await createItem(page, { name: `E2E-G${s} 親`, plannedStart: "2026-10-01", plannedEnd: "2026-10-05" })
  leaf = await createItem(page, { name: `E2E-G${s} ドラッグ`, parentId: parent.id, plannedStart: "2026-10-01", plannedEnd: "2026-10-03" })
  leaf2 = await createItem(page, { name: `E2E-G${s} キーボード`, parentId: parent.id, plannedStart: "2026-10-02", plannedEnd: "2026-10-04" })
  ms = await createItem(page, { name: `E2E-G${s} MS`, parentId: parent.id, plannedStart: "2026-10-05", plannedEnd: "2026-10-05", isMilestone: true })
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  await deleteItem(page, parent.id)
  await ctx.close()
})

const find = async (page: Page, id: string) => (await getPlan(page)).items.find((i) => i.id === id)!

async function namesOnly(page: Page) {
  const btn = page.getByRole("button", { name: "表を名前だけにする" })
  if (await btn.isVisible().catch(() => false)) await btn.click()
}

test("mouse move + resize with live tooltip, persisted after reload", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page, "?zoom=day")
  await namesOnly(page)
  const b = bar(page, leaf.id)
  await b.scrollIntoViewIfNeeded()
  const box = (await b.boundingBox())!
  expect(box.width).toBeCloseTo(3 * DW, 0)
  // Move +2 days
  await page.mouse.move(box.x + box.width / 2 - 10, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 10 + DW, box.y + box.height / 2, { steps: 5 })
  await page.mouse.move(box.x + box.width / 2 - 10 + 2 * DW, box.y + box.height / 2, { steps: 5 })
  const tip = page.locator('[data-plan-chart] [role="status"]').filter({ hasText: "→" })
  await expect(tip).toBeVisible()
  console.log("drag tooltip:", await tip.innerText())
  await expect(tip).toHaveText(/10\/03\(土\) → 10\/05\(月\)\s*3日/)
  await page.screenshot({ path: `${SHOTS}/30-drag-tooltip.png` })
  await page.mouse.up()
  await expect(tip).toHaveCount(0)
  await expect.poll(async () => (await find(page, leaf.id)).plannedStart).toBe("2026-10-03")
  expect((await find(page, leaf.id)).plannedEnd).toBe("2026-10-05")
  // Click after drag must not open the editor
  await expect(page.getByRole("dialog")).toHaveCount(0)

  // Resize end +2 days via the right handle
  const handle = page.locator(`[data-plan-resize="${leaf.id}"]`)
  const hb = (await handle.boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2 + 2 * DW, hb.y + hb.height / 2, { steps: 8 })
  await expect(tip).toHaveText(/10\/03\(土\) → 10\/07\(水\)\s*5日/)
  await page.screenshot({ path: `${SHOTS}/30-resize-tooltip.png` })
  // Resize past the start (shrinks to 1 day, never inverted)
  await page.mouse.move(hb.x - 10 * DW, hb.y + hb.height / 2, { steps: 8 })
  console.log("resize beyond start tooltip:", await tip.innerText())
  await page.mouse.move(hb.x + hb.width / 2 + 2 * DW, hb.y + hb.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => (await find(page, leaf.id)).plannedEnd).toBe("2026-10-07")
  await page.reload()
  await expect(bar(page, leaf.id)).toBeAttached()
  const after = (await bar(page, leaf.id).boundingBox())!
  expect(after.width).toBeCloseTo(5 * DW, 0)
  // Parent rolled up to new child range
  const p = await find(page, parent.id)
  console.log("parent after drag:", p.plannedStart, p.plannedEnd)
  expect(p.plannedEnd).toBe("2026-10-07")
  report("mouse drag", issues)
  await ctx.close()
})

test("summary bar is not draggable; milestone drags (move only)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page, "?zoom=day")
  await namesOnly(page)
  const before = await find(page, parent.id)
  const pb = (await bar(page, parent.id).boundingBox())!
  await page.mouse.move(pb.x + 20, pb.y + pb.height / 2)
  await page.mouse.down()
  await page.mouse.move(pb.x + 20 + 3 * DW, pb.y + pb.height / 2, { steps: 6 })
  const tipVisible = await page.locator('[data-plan-chart] [role="status"]').filter({ hasText: "→" }).isVisible()
  await page.mouse.up()
  console.log("summary drag tooltip shown:", tipVisible, "cursor:", await bar(page, parent.id).evaluate((e) => getComputedStyle(e).cursor))
  await page.waitForTimeout(800)
  const after = await find(page, parent.id)
  expect(after.plannedStart).toBe(before.plannedStart)
  expect(after.plannedEnd).toBe(before.plannedEnd)
  // Keyboard on summary: arrows do nothing.
  await bar(page, parent.id).focus()
  await page.keyboard.press("ArrowRight")
  await page.waitForTimeout(800)
  expect((await find(page, parent.id)).plannedStart).toBe(before.plannedStart)

  // Milestone drag -3 days
  const mb = (await bar(page, ms.id).boundingBox())!
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
  await page.mouse.down()
  await page.mouse.move(mb.x + mb.width / 2 - 3 * DW, mb.y + mb.height / 2, { steps: 8 })
  // F-15: a milestone shows its single date, not a range
  const tip = page.locator('[data-plan-chart] [role="status"]').filter({ hasText: /10\/0\d/ })
  await expect(tip).toHaveText(/^10\/02\(金\)$/)
  await page.screenshot({ path: `${SHOTS}/31-milestone-drag.png` })
  await page.mouse.up()
  await expect.poll(async () => (await find(page, ms.id)).plannedEnd).toBe("2026-10-02")
  expect((await find(page, ms.id)).plannedStart).toBe("2026-10-02")
  report("summary/milestone", issues)
  await ctx.close()
})

test("keyboard: ←/→ move, Shift+←/→ resize, one PATCH per burst", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page, "?zoom=day")
  const patches: string[] = []
  page.on("request", (r) => { if (r.method() === "PATCH" && r.url().includes("/plan/")) patches.push(r.postData() ?? "") })
  await bar(page, leaf2.id).focus()
  await expect(bar(page, leaf2.id)).toBeFocused()
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  await page.keyboard.press("ArrowRight")
  const tip = page.locator('[data-plan-chart] [role="status"]').filter({ hasText: "→" })
  await expect(tip).toHaveText(/10\/05\(月\) → 10\/07\(水\)/)
  await page.screenshot({ path: `${SHOTS}/32-keyboard-nudge.png` })
  await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("Shift+ArrowRight")
  await page.keyboard.press("Shift+ArrowLeft")
  await expect.poll(async () => (await find(page, leaf2.id)).plannedEnd, { timeout: 10_000 }).toBe("2026-10-08")
  expect((await find(page, leaf2.id)).plannedStart).toBe("2026-10-05")
  console.log("PATCH count for 6 key presses:", patches.length, patches)
  expect(patches.length).toBe(1)
  // Shift+← cannot shrink below one day
  for (let i = 0; i < 6; i++) await page.keyboard.press("Shift+ArrowLeft")
  await expect.poll(async () => (await find(page, leaf2.id)).plannedEnd, { timeout: 10_000 }).toBe("2026-10-05")
  // Enter opens editor
  await page.keyboard.press("Enter")
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.keyboard.press("Escape")
  // ↑/↓ move focus between bars
  await bar(page, leaf2.id).focus()
  await page.keyboard.press("ArrowUp")
  await expect(bar(page, leaf.id)).toBeFocused()
  report("keyboard", issues)
  await ctx.close()
})

test("touch: swipe scrolls the timeline, long-press drags the bar", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await gotoPlan(page, "?zoom=day")
  const b = bar(page, leaf2.id)
  await b.scrollIntoViewIfNeeded()
  const before = await find(page, leaf2.id)
  const cdp = await ctx.newCDPSession(page)
  const touch = async (type: "touchStart" | "touchMove" | "touchEnd", x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", { type, touchPoints: type === "touchEnd" ? [] : [{ x, y }] })
  const box = (await b.boundingBox())!
  const cx = box.x + Math.min(box.width / 2, 20)
  const cy = box.y + box.height / 2
  const chart = page.locator("[data-plan-chart]")
  const sl0 = await chart.evaluate((e) => e.scrollLeft)
  // Swipe: quick horizontal move
  await touch("touchStart", cx, cy)
  for (let i = 1; i <= 6; i++) { await touch("touchMove", cx - i * 15, cy); await page.waitForTimeout(16) }
  await touch("touchEnd", 0, 0)
  await page.waitForTimeout(700)
  const sl1 = await chart.evaluate((e) => e.scrollLeft)
  const mid = await find(page, leaf2.id)
  console.log("swipe: scrollLeft", sl0, "→", sl1, "dates", mid.plannedStart, mid.plannedEnd)
  expect(mid.plannedStart).toBe(before.plannedStart)
  expect(sl1).not.toBe(sl0)

  // Long press then drag +2 days. Bring the bar out from under the sticky name column first.
  await page.evaluate((id) => {
    const c = document.querySelector("[data-plan-chart]") as HTMLElement
    const bar = document.querySelector(`[data-plan-bar="${id}"]`)!.getBoundingClientRect()
    const grid = (document.querySelector('[data-plan-chart] [role="row"] > div') as HTMLElement).getBoundingClientRect()
    c.scrollLeft += bar.x - (grid.right + 40)
  }, leaf2.id)
  await page.waitForTimeout(200)
  const box2 = (await b.boundingBox())!
  const hit = await page.evaluate(([x, y]) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest("[data-plan-bar]") !== null, [box2.x + Math.min(box2.width / 2, 20), box2.y + box2.height / 2])
  expect(hit, "touch point is on the bar").toBeTruthy()
  const x0 = box2.x + Math.min(box2.width / 2, 20)
  const y0 = box2.y + box2.height / 2
  await touch("touchStart", x0, y0)
  await page.waitForTimeout(450)
  const sl2 = await chart.evaluate((e) => e.scrollLeft)
  for (let i = 1; i <= 8; i++) { await touch("touchMove", x0 + (i * 2 * DW) / 8, y0); await page.waitForTimeout(20) }
  await page.screenshot({ path: `${SHOTS}/33-touch-longpress-drag.png` })
  await touch("touchEnd", 0, 0)
  const sl3 = await chart.evaluate((e) => e.scrollLeft)
  console.log("long-press scrollLeft during drag", sl2, "→", sl3)
  await expect.poll(async () => (await find(page, leaf2.id)).plannedStart, { timeout: 10_000 }).toBe(
    new Date(Date.parse(before.plannedStart) + 2 * 86_400_000).toISOString().slice(0, 10),
  )
  report("touch", issues)
  await ctx.close()
})
