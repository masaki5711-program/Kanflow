import AxeBuilder from "@axe-core/playwright"
import { expect, test } from "@playwright/test"
import { PROJECT2, SHOTS, bar, createItem, deleteItem, getPlan, gotoPlan, patchItem, report, row, stamp, userPage, type Item } from "./plan-support"

/** axe scan, optimistic-lock conflict, long names, 60-item performance. Runs in the ZEVA project. */

test("axe: plan page + editor (WCAG 2.2 A/AA)", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  const it = await (async () => { await page.goto("/"); return createItem(page, { name: `E2E-A${stamp()} axe`, plannedStart: "2026-10-01", plannedEnd: "2026-10-05" }, PROJECT2) })()
  await gotoPlan(page, "", PROJECT2)
  const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]
  const main = await new AxeBuilder({ page }).withTags(tags).analyze()
  for (const v of main.violations) console.log(`PAGE ${v.impact} ${v.id}: ${v.help} (${v.nodes.length}) e.g. ${v.nodes[0]?.target.join(" ")} :: ${v.nodes[0]?.failureSummary?.split("\n")[1] ?? ""}`)
  await bar(page, it.id).dblclick()
  await expect(page.getByRole("dialog")).toBeVisible()
  await page.waitForTimeout(800)
  const dlg = await new AxeBuilder({ page }).withTags(tags).include('[role="dialog"]').analyze()
  for (const v of dlg.violations) for (const n of v.nodes.slice(0, 6)) console.log(`EDITOR ${v.impact} ${v.id}: ${n.html.slice(0, 120)} :: ${(n.failureSummary ?? "").split(String.fromCharCode(10))[1] ?? ""}`)
  await page.keyboard.press("Escape")
  // Focus ring on bar
  await bar(page, it.id).focus()
  await page.screenshot({ path: `${SHOTS}/85-bar-focus.png`, clip: { x: 900, y: 180, width: 540, height: 400 } })
  console.log("violations page/editor:", main.violations.length, dlg.violations.length)
  await deleteItem(page, it.id, PROJECT2)
  report("axe", issues)
  await ctx.close()
})

test("optimistic lock: stale editor save → conflict handling", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  const it = await createItem(page, { name: `E2E-L${stamp()} lock`, plannedStart: "2026-10-01", plannedEnd: "2026-10-05" }, PROJECT2)
  await gotoPlan(page, "", PROJECT2)
  await bar(page, it.id).dblclick()
  const d = page.getByRole("dialog")
  await d.getByLabel("説明").fill("stale edit")
  // Someone else edits meanwhile
  expect((await patchItem(page, it.id, { description: "other user" }, PROJECT2)).status).toBeLessThan(300)
  await d.getByRole("button", { name: "保存" }).click()
  await page.waitForTimeout(1500)
  const toasts = await page.locator('[role="status"], [role="alert"]').allInnerTexts()
  console.log("after stale save, toasts:", JSON.stringify(toasts.filter(Boolean)))
  console.log("editor still open:", await d.isVisible())
  await page.screenshot({ path: `${SHOTS}/86-conflict.png` })
  const now = (await getPlan(page, PROJECT2)).items.find((i) => i.id === it.id)!
  console.log("server description:", now.description)
  expect(now.description).toBe("other user")
  // F-03: the editor reloads the server copy and says so; a second Save cannot silently overwrite
  const notice = d.getByRole("alert").filter({ hasText: "他のユーザーが先に更新したため" })
  await expect(notice).toBeVisible()
  await expect(notice).toContainText("stale edit")
  // N-05: the dialog's notice is the only message — no duplicate red toast
  await expect(page.getByText("他のユーザーが先に更新しました。最新の内容を読み込みました")).toHaveCount(0)
  await expect(d.getByLabel("説明")).toHaveValue("other user")
  await d.getByRole("button", { name: "保存" }).click()
  await expect(d).toHaveCount(0)
  const again = (await getPlan(page, PROJECT2)).items.find((i) => i.id === it.id)!
  expect(again.description).toBe("other user")
  // Stale inline drag: bar dates changed elsewhere, then keyboard nudge from stale view
  await page.keyboard.press("Escape")
  const discard = page.getByRole("button", { name: /破棄/ })
  if (await discard.isVisible().catch(() => false)) await discard.click()
  await deleteItem(page, it.id, PROJECT2)
  report("conflict", issues)
  await ctx.close()
})

test("long names + 60 items: render time, truncation, drag responsiveness", async ({ browser }) => {
  const { ctx, page, issues } = await userPage(browser, "po", { viewport: { width: 1440, height: 900 } })
  await page.goto("/")
  const s = stamp()
  const root = await createItem(page, { name: `E2E-N${s} とても長い名前のフェーズ：要件定義から基本設計・詳細設計・実装・結合試験までを含む大きな工程`, plannedStart: "2026-09-01", plannedEnd: "2026-12-31" }, PROJECT2)
  const created: Item[] = []
  for (let i = 0; i < 60; i++) {
    const start = new Date(Date.UTC(2026, 8, 1 + i * 2)).toISOString().slice(0, 10)
    const end = new Date(Date.UTC(2026, 8, 6 + i * 2)).toISOString().slice(0, 10)
    created.push(await createItem(page, { name: `E2E-N${s} 作業 ${String(i + 1).padStart(2, "0")}`, parentId: root.id, plannedStart: start, plannedEnd: end }, PROJECT2))
  }
  const t0 = Date.now()
  await gotoPlan(page, "", PROJECT2)
  await expect(page.locator("[data-plan-bar]")).toHaveCount((await getPlan(page, PROJECT2)).items.length)
  console.log("page load → all bars rendered ms:", Date.now() - t0)
  await page.screenshot({ path: `${SHOTS}/87-many-items.png`, fullPage: true })
  const nameTitle = await row(page, root.id).locator("[data-plan-name]").getAttribute("title")
  console.log("long name has title tooltip:", !!nameTitle)
  // Drag a bar in the middle and time the preview updates
  const target = created[30]
  await row(page, target.id).scrollIntoViewIfNeeded()
  const bb = (await bar(page, target.id).boundingBox())!
  const t1 = Date.now()
  await page.mouse.move(bb.x + 10, bb.y + bb.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 20; i++) await page.mouse.move(bb.x + 10 + i * 7, bb.y + bb.height / 2)
  const dragMs = Date.now() - t1
  await page.mouse.up()
  console.log("20 pointer moves during drag took ms:", dragMs)
  await deleteItem(page, root.id, PROJECT2)
  report("many", issues)
  await ctx.close()
})
