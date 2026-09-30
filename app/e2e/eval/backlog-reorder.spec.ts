import { expect, test, type Page } from "@playwright/test"
import { gotoBacklog, login, report, SHOTS, watch } from "./backlog-support"

test.describe.configure({ mode: "serial" })
test.use({ viewport: { width: 1280, height: 1400 } })

const readyRegion = (page: Page) => page.getByRole("region", { name: "Ready（着手可能）" })
async function readyOrder(page: Page): Promise<string[]> {
  return readyRegion(page).locator("[data-dnd-row] button[data-drag-handle]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label") ?? ""))
}
const ids = (labels: string[]) => labels.map((l) => l.replace(/^#(\d+).*/, "$1"))

test("pointer drag reorders and persists", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const before = ids(await readyOrder(page))
  expect(before.length).toBeGreaterThanOrEqual(3)
  const last = before[before.length - 1]
  const handle = readyRegion(page).locator(`button[aria-label="#${last} を並べ替え"]`)
  const firstRow = readyRegion(page).locator("[data-dnd-row]").first()
  const hb = (await handle.boundingBox())!
  const fb = (await firstRow.boundingBox())!
  const reorderReq = page.waitForRequest((r) => r.url().includes("/backlog/reorder") && r.method() === "PUT")
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(hb.x + hb.width / 2, hb.y + (fb.y + 5 - hb.y) * (i / 12))
  await page.screenshot({ path: `${SHOTS}/reorder-pointer-dragging.png` })
  await page.mouse.up()
  const req = await reorderReq
  console.log("reorder body", req.postData())
  const after = ids(await readyOrder(page))
  expect(after[0]).toBe(last)
  await page.reload()
  await expect.poll(async () => ids(await readyOrder(page))[0]).toBe(last)
  report("pointer", issues)
})

test("keyboard reorder: Space, arrows, Space; Esc cancels", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const before = ids(await readyOrder(page))
  const first = before[0]
  const handle = readyRegion(page).locator(`button[aria-label="#${first} を並べ替え"]`)
  await handle.focus()
  await page.keyboard.press("Space")
  await expect(handle).toHaveAttribute("aria-pressed", "true")
  const live = await page.locator("[aria-live]").allInnerTexts()
  console.log("live regions after pick", JSON.stringify(live))
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await expect.poll(async () => ids(await readyOrder(page)).indexOf(first)).toBe(2)
  await page.keyboard.press("Escape")
  await expect.poll(async () => ids(await readyOrder(page))).toEqual(before)
  // commit
  await handle.focus()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  const put = page.waitForResponse((r) => r.url().includes("/backlog/reorder"))
  await page.keyboard.press("Space")
  expect((await put).status()).toBeLessThan(300)
  await expect(page.locator(`button[aria-label="#${first} を並べ替え"]`)).toBeFocused()
  await page.reload()
  await expect.poll(async () => ids(await readyOrder(page)).indexOf(first)).toBe(2)
  report("keyboard", issues)
})

test("card menu: 先頭へ / 末尾へ, keyboard operable", async ({ page }) => {
  const issues = watch(page)
  await login(page, "po")
  await gotoBacklog(page)
  const before = ids(await readyOrder(page))
  const target = before[1]
  const menuBtn = readyRegion(page).getByRole("button", { name: `#${target} のその他の操作` })
  await menuBtn.click()
  const menu = page.getByRole("menu", { name: `#${target} のその他の操作` })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole("menuitem", { name: "先頭へ" })).toBeFocused()
  await page.screenshot({ path: `${SHOTS}/reorder-card-menu.png` })
  await menu.getByRole("menuitem", { name: "先頭へ" }).click()
  await expect.poll(async () => ids(await readyOrder(page))[0]).toBe(target)
  // keyboard: ArrowDown opens, ArrowDown moves to 末尾へ, Enter
  await readyRegion(page).getByRole("button", { name: `#${target} のその他の操作` }).focus()
  await page.keyboard.press("ArrowDown")
  await page.keyboard.press("ArrowDown")
  await expect(page.getByRole("menuitem", { name: "末尾へ" })).toBeFocused()
  await page.keyboard.press("Enter")
  await expect.poll(async () => ids(await readyOrder(page)).at(-1)).toBe(target)
  // Esc closes and returns focus
  const btn = readyRegion(page).getByRole("button", { name: `#${target} のその他の操作` })
  await btn.click()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  await expect(btn).toBeFocused()
  await page.reload()
  await expect.poll(async () => ids(await readyOrder(page)).at(-1)).toBe(target)
  // restore original order via menu clicks (best effort)
  for (const id of [...before].reverse()) {
    await readyRegion(page).getByRole("button", { name: `#${id} のその他の操作` }).click()
    const put = page.waitForResponse((r) => r.url().includes("/backlog/reorder"))
    await page.getByRole("menuitem", { name: "先頭へ" }).click()
    await put.catch(() => undefined)
  }
  await page.reload()
  console.log("restored order", ids(await readyOrder(page)), "original", before)
  report("menu", issues)
})

test("drag while filtered keeps hidden items' slots", async ({ page }) => {
  await login(page, "po")
  await gotoBacklog(page)
  const all = ids(await readyOrder(page))
  await page.getByRole("combobox", { name: "工数" }).selectOption("5")
  const visible = ids(await readyOrder(page))
  console.log("filtered visible", visible, "all", all)
  test.skip(visible.length < 2, "need 2 visible items")
  const handle = readyRegion(page).locator(`button[aria-label="#${visible[1]} を並べ替え"]`)
  await handle.focus()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowUp")
  const put = page.waitForResponse((r) => r.url().includes("/backlog/reorder"))
  await page.keyboard.press("Space")
  await put
  await page.getByRole("button", { name: "絞り込みを解除" }).click()
  const after = ids(await readyOrder(page))
  console.log("after filtered move", after)
  // hidden items keep their absolute positions
  for (const [i, id] of all.entries()) if (!visible.includes(id)) expect(after[i]).toBe(id)
  // restore
  await page.getByRole("combobox", { name: "工数" }).selectOption("5")
  await readyRegion(page).locator(`button[aria-label="#${visible[1]} を並べ替え"]`).focus()
  await page.keyboard.press("Space")
  await page.keyboard.press("ArrowUp")
  await page.keyboard.press("Space")
})
