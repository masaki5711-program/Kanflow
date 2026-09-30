import { expect, test, type Page } from "@playwright/test"
import { PROJECT2, SHOTS, bar, createItem, deleteItem, getPlan, gotoPlan, patchItem, report, row, stamp, userPage, type Item } from "./plan-support"

/** Baseline save/clear + variance chip; dependencies (add, arrows, violation, cycle, delete). Runs in the ZEVA project. */
test.describe.configure({ mode: "serial" })

let s = ""
let A: Item, B: Item, C: Item
const find = async (page: Page, id: string) => (await getPlan(page, PROJECT2)).items.find((i) => i.id === id)!
const go = (page: Page, q = "") => gotoPlan(page, q, PROJECT2)

async function menu(page: Page, item: Item, entry: string) {
  await row(page, item.id).hover()
  await page.getByRole("button", { name: `${item.name} の操作` }).click()
  await page.getByRole("menuitem", { name: entry }).click()
}

test.beforeAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  s = stamp()
  A = await createItem(page, { name: `E2E-B${s} A`, plannedStart: "2026-10-01", plannedEnd: "2026-10-05" }, PROJECT2)
  B = await createItem(page, { name: `E2E-B${s} B`, plannedStart: "2026-10-06", plannedEnd: "2026-10-10" }, PROJECT2)
  C = await createItem(page, { name: `E2E-B${s} C`, plannedStart: "2026-10-12", plannedEnd: "2026-10-16" }, PROJECT2)
  await ctx.close()
})

test.afterAll(async ({ browser }) => {
  const { ctx, page } = await userPage(browser, "po")
  await page.goto("/")
  for (const it of [A, B, C]) await deleteItem(page, it.id, PROJECT2)
  await ctx.close()
})

test("baseline save → variance chip after slip → clear", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await go(page)
  await page.getByRole("button", { name: "その他の操作" }).click()
  const clearItem = page.getByRole("menuitem", { name: "基準線をクリア" })
  console.log("clear baseline disabled before save:", await clearItem.isDisabled())
  await page.getByRole("menuitem", { name: "基準線を保存" }).click()
  await expect(page.getByText("現在の計画日程を基準線として保存しますか？既存の基準線は上書きされます。")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/60-baseline-confirm.png` })
  await page.getByRole("button", { name: "基準線を保存" }).last().click()
  await expect(page.getByText("基準線を保存しました")).toBeVisible()
  await expect(page.locator(`[data-plan-baseline="${B.id}"]`)).toBeAttached()
  expect((await find(page, B.id)).baselineEnd).toBe("2026-10-10")
  // Slip B by 3 days
  expect((await patchItem(page, B.id, { plannedStart: "2026-10-09", plannedEnd: "2026-10-13" }, PROJECT2)).status).toBeLessThan(300)
  await page.reload()
  await expect(row(page, B.id).getByText("+3日")).toBeVisible()
  expect((await find(page, B.id)).baselineVarianceDays).toBe(3)
  // Pull A earlier: negative variance → no chip
  await patchItem(page, A.id, { plannedStart: "2026-09-29", plannedEnd: "2026-10-03" }, PROJECT2)
  await page.reload()
  await expect(row(page, A.id).getByText(/^\+\d+日$/)).toHaveCount(0)
  console.log("A variance:", (await find(page, A.id)).baselineVarianceDays)
  await page.screenshot({ path: `${SHOTS}/61-baseline-variance.png` })
  // Editor shows baseline + variance
  await bar(page, B.id).dblclick()
  const d = page.getByRole("dialog")
  await expect(d.getByText("10/06(火) → 10/10(土)")).toBeVisible()
  await expect(d.getByText("基準線より 3 日遅れ")).toBeVisible()
  await page.keyboard.press("Escape")
  report("baseline", issues)
  await ctx.close()
})

test("dependencies: add successor via menu, arrow, violation, cycle rejected, delete", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await go(page)
  // A → B (B starts 10/09 after A ends 10/03: OK)
  await menu(page, A, "後続を追加…")
  const picker = page.getByRole("dialog")
  await expect(picker.getByRole("heading", { name: "後続項目を選択" })).toBeVisible()
  const candidates = await picker.getByRole("button").filter({ hasText: /E2E|なにか|小項目|ｈｓ/ }).allInnerTexts()
  console.log("successor candidates:", JSON.stringify(candidates))
  await picker.getByRole("searchbox").fill(`E2E-B${s} B`)
  await page.screenshot({ path: `${SHOTS}/62-successor-picker.png` })
  await picker.getByRole("button", { name: new RegExp(`E2E-B${s} B`) }).click()
  await expect(page.getByText("依存関係を追加しました")).toBeVisible()
  await expect(page.locator("[data-plan-arrow]")).toHaveCount(1)
  // B → C where C starts 10/12 before B ends 10/13 → violated
  await menu(page, B, "後続を追加…")
  await page.getByRole("dialog").getByRole("button", { name: new RegExp(`E2E-B${s} C`) }).click()
  await expect(page.locator("[data-plan-arrow]")).toHaveCount(2)
  await expect(page.locator('[data-plan-arrow][data-violated="true"]')).toHaveCount(1)
  await page.screenshot({ path: `${SHOTS}/63-dependency-arrows.png` })
  // F-11 cycle: C → A would close A → B → C; the picker shows A disabled with the reason
  await menu(page, C, "後続を追加…")
  const optionA = page.getByRole("dialog").getByRole("button", { name: new RegExp(`E2E-B${s} A`) })
  await expect(optionA).toBeDisabled()
  await expect(optionA).toContainText("循環するため選べません")
  await expect(page.getByRole("dialog").getByRole("button", { name: new RegExp(`E2E-B${s} B`) })).toBeDisabled()
  await page.screenshot({ path: `${SHOTS}/64-dependency-cycle.png` })
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-plan-arrow]")).toHaveCount(2)
  // Editor lists predecessors/successors with violation, delete one
  await bar(page, C.id).dblclick()
  const d = page.getByRole("dialog")
  await expect(d.getByRole("heading", { name: "依存関係" })).toBeVisible()
  await expect(d.getByText("先行項目の終了前に開始しています")).toBeVisible()
  await page.screenshot({ path: `${SHOTS}/65-editor-deps.png`, fullPage: true })
  await d.getByRole("button", { name: `依存関係を削除: E2E-B${s} B` }).click()
  await expect(page.getByText("依存関係を削除しました")).toBeVisible()
  await expect(d.getByText("依存関係はありません")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.locator("[data-plan-arrow]")).toHaveCount(1)
  expect((await getPlan(page, PROJECT2)).dependencies.length).toBe(1)
  // Fix the violation by dragging (keyboard) C after B → no violated arrows left.
  report("deps", issues)
  await ctx.close()
})

test("clear baseline", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await go(page)
  await page.getByRole("button", { name: "その他の操作" }).click()
  await page.getByRole("menuitem", { name: "基準線をクリア" }).click()
  await expect(page.getByText("すべての基準線をクリアしますか？")).toBeVisible()
  await page.getByRole("button", { name: "基準線をクリア" }).last().click()
  await expect(page.getByText("基準線をクリアしました")).toBeVisible()
  await expect(page.locator("[data-plan-baseline]")).toHaveCount(0)
  expect((await find(page, B.id)).baselineStart).toBeNull()
  report("clear baseline", issues)
  await ctx.close()
})
