import { expect, test, type Page } from "@playwright/test"
import { SHOTS, createItem, deleteItem, getPlan, gotoPlan, nameBtn, report, row, stamp, userPage, type Item } from "./plan-support"

/** Reorder / restructure: drag handle, Alt+arrows, row "…" menu. */

let root: Item
let a: Item
let b: Item
let c: Item
let s = ""

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  s = stamp()
  root = await createItem(page, { name: `E2E-Q${s} 並べ替え`, plannedStart: "2026-10-01", plannedEnd: "2026-10-10" })
  a = await createItem(page, { name: `E2E-Q${s} A`, parentId: root.id, plannedStart: "2026-10-01", plannedEnd: "2026-10-03" })
  b = await createItem(page, { name: `E2E-Q${s} B`, parentId: root.id, plannedStart: "2026-10-04", plannedEnd: "2026-10-06" })
  c = await createItem(page, { name: `E2E-Q${s} C`, parentId: root.id, plannedStart: "2026-10-07", plannedEnd: "2026-10-10" })
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  await deleteItem(page, root.id)
  await ctx.close()
})

async function order(page: Page): Promise<string[]> {
  const ids = await page.locator("[data-plan-row]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.planRow!))
  return ids.filter((id) => [a.id, b.id, c.id].includes(id)).map((id) => (id === a.id ? "A" : id === b.id ? "B" : "C"))
}
const serverTree = async (page: Page) => {
  const items = (await getPlan(page)).items.filter((i) => [a.id, b.id, c.id].includes(i.id))
  return Object.fromEntries(items.map((i) => [i.id === a.id ? "A" : i.id === b.id ? "B" : "C", { parent: i.parentId === root.id ? "root" : i.parentId === a.id ? "A" : i.parentId === b.id ? "B" : i.parentId, sort: (i as any).sortOrder }]))
}

test("drag handle reorders rows (persisted)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  expect(await order(page)).toEqual(["A", "B", "C"])
  const h = page.locator(`[data-plan-handle="${c.id}"]`)
  const hb = (await h.boundingBox())!
  const target = (await row(page, a.id).boundingBox())!
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2)
  await page.mouse.down()
  await page.mouse.move(hb.x + hb.width / 2, target.y + 8, { steps: 10 })
  await expect(page.locator("[data-plan-drop]")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/40-row-drag-indicator.png` })
  await page.mouse.up()
  await expect.poll(() => order(page)).toEqual(["C", "A", "B"])
  await page.reload()
  await expect(row(page, a.id)).toBeVisible()
  expect(await order(page)).toEqual(["C", "A", "B"])
  report("row drag", issues)
  await ctx.close()
})

test("Alt+↑/↓ reorder, Alt+→/← indent/outdent keep focus", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  const start = await order(page)
  console.log("start order", start)
  await nameBtn(page, b.id).focus()
  await page.keyboard.press("Alt+ArrowUp")
  const i = start.indexOf("B")
  const expected = [...start]
  if (i > 0) [expected[i - 1], expected[i]] = [expected[i], expected[i - 1]]
  await expect.poll(() => order(page)).toEqual(expected)
  await expect(nameBtn(page, b.id)).toBeFocused()
  await page.keyboard.press("Alt+ArrowDown")
  await expect.poll(() => order(page)).toEqual(start)
  // Indent B under its previous sibling
  await page.keyboard.press("Alt+ArrowRight")
  await expect.poll(async () => (await serverTree(page)).B.parent, { timeout: 10_000 }).not.toBe("root")
  const t1 = await serverTree(page)
  console.log("after indent", JSON.stringify(t1))
  await expect(nameBtn(page, b.id)).toBeFocused()
  await page.screenshot({ path: `${SHOTS}/41-indent.png` })
  await page.keyboard.press("Alt+ArrowLeft")
  await expect.poll(async () => (await serverTree(page)).B.parent, { timeout: 10_000 }).toBe("root")
  console.log("after outdent", JSON.stringify(await serverTree(page)), "rows", await order(page))
  report("alt keys", issues)
  await ctx.close()
})

test("row … menu: 下へ / インデント / アウトデント, disabled outdent at top level", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await gotoPlan(page)
  const start = await order(page)
  await row(page, start[0] === "A" ? a.id : start[0] === "B" ? b.id : c.id).hover()
  const firstName = start[0]
  const firstId = firstName === "A" ? a.id : firstName === "B" ? b.id : c.id
  await page.getByRole("button", { name: `E2E-Q${s} ${firstName} の操作` }).click()
  const menu = page.getByRole("menu")
  const items = await menu.getByRole("menuitem").allInnerTexts()
  console.log("leaf menu items:", JSON.stringify(items))
  await page.screenshot({ path: `${SHOTS}/42-row-menu-leaf.png` })
  // F-18: the first child can neither move up nor be indented
  await expect(menu.getByRole("menuitem", { name: "上へ" })).toBeDisabled()
  await expect(menu.getByRole("menuitem", { name: "インデント" })).toBeDisabled()
  await menu.getByRole("menuitem", { name: "下へ" }).click()
  await expect.poll(() => order(page)).toEqual([start[1], start[0], start[2]])
  // root's menu: outdent disabled
  await row(page, root.id).hover()
  await page.getByRole("button", { name: `E2E-Q${s} 並べ替え の操作` }).click()
  const out = page.getByRole("menuitem", { name: "アウトデント" })
  console.log("root outdent disabled:", await out.isDisabled(), "aria-disabled:", await out.getAttribute("aria-disabled"))
  const rootItems = await page.getByRole("menu").getByRole("menuitem").allInnerTexts()
  console.log("parent menu items:", JSON.stringify(rootItems))
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).toHaveCount(0)
  // indent via menu then outdent via menu
  await row(page, firstId).hover()
  await page.getByRole("button", { name: `E2E-Q${s} ${firstName} の操作` }).click()
  await page.getByRole("menuitem", { name: "インデント" }).click()
  await expect.poll(async () => (await serverTree(page))[firstName as "A"].parent, { timeout: 10_000 }).not.toBe("root")
  await row(page, firstId).hover()
  await page.getByRole("button", { name: `E2E-Q${s} ${firstName} の操作` }).click()
  await page.getByRole("menuitem", { name: "アウトデント" }).click()
  await expect.poll(async () => (await serverTree(page))[firstName as "A"].parent, { timeout: 10_000 }).toBe("root")
  report("row menu", issues)
  await ctx.close()
})
